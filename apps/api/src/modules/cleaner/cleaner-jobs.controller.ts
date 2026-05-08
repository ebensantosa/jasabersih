import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { JobsGateway } from '../jobs/jobs.gateway';
import { PushService } from '../notifications/push.service';

@ApiTags('cleaner-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cleaner/jobs')
export class CleanerJobsController {
  constructor(private readonly prisma: PrismaService, private readonly jobs: JobsGateway, private readonly push: PushService) {}

  // List bookings searching that this cleaner can take. Filter by service area di future.
  @Get('available')
  async available(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.prisma.$queryRaw<{ kyc_status: string | null }[]>`
      SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    if (profile[0]?.kyc_status !== 'approved') return [];

    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt", b.total_amount AS "totalAmount",
             b.cleaner_payout AS "cleanerPayout",
             s.name AS "serviceName", s.icon_url AS "serviceIconUrl"
        FROM bookings b LEFT JOIN services s ON s.id = b.service_id
       WHERE b.status = 'searching' AND b.cleaner_id IS NULL
       ORDER BY b.created_at DESC LIMIT 50
    `;
  }

  // Active jobs assigned to this cleaner (not completed/cancelled)
  @Get('active')
  async active(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.status, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt", b.total_amount AS "totalAmount",
             b.cleaner_payout AS "cleanerPayout",
             s.name AS "serviceName",
             u.name AS "customerName", u.phone AS "customerPhone"
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN users u ON u.id = b.customer_id
       WHERE b.cleaner_id = ${user.id}::uuid
         AND b.status IN ('matched', 'cleaner_otw', 'on_the_way', 'in_progress', 'started')
       ORDER BY b.scheduled_at ASC LIMIT 50
    `;
  }

  // HTTP fallback untuk accept (kalau socket ga konek). Atomic, race-safe.
  @Post(':id/accept')
  async accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const profile = await this.prisma.$queryRaw<{ kyc_status: string | null }[]>`
      SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    if (profile[0]?.kyc_status !== 'approved') throw new ForbiddenException('KYC belum approved.');

    const updated = await this.prisma.$executeRaw`
      UPDATE bookings
         SET cleaner_id = ${user.id}::uuid, status = 'matched', matched_at = NOW()
       WHERE id = ${id}::uuid AND cleaner_id IS NULL AND status = 'searching'
    `;
    if (Number(updated) === 0) throw new BadRequestException('Job sudah diambil cleaner lain.');

    const b = await this.prisma.$queryRaw<{ customer_id: string }[]>`
      SELECT customer_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    if (b[0]?.customer_id) {
      void this.push.send({
        userId: b[0].customer_id, channel: 'booking',
        title: 'Cleaner ditemukan!', body: 'Tap untuk lihat detail.',
        data: { type: 'booking_matched', bookingId: id },
      }).catch(() => {});
    }
    return { ok: true };
  }

  // Cleaner advance booking status. Hanya forward transitions yg di-allow:
  //   matched → on_the_way → in_progress → completed
  @Post(':id/status')
  async advanceStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { to: 'on_the_way' | 'in_progress' | 'completed' },
  ) {
    if (!body?.to) throw new BadRequestException('to wajib.');

    const allowedFrom: Record<string, string[]> = {
      on_the_way: ['matched'],
      in_progress: ['on_the_way', 'matched'],
      completed: ['in_progress'],
    };
    const fromList = allowedFrom[body.to];
    if (!fromList) throw new BadRequestException('Status target invalid.');

    // Atomic: only update if cleaner_id = me AND current status in allowed list
    const fromCsv = fromList.map((s) => `'${s}'`).join(',');
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE bookings
          SET status = $1,
              cleaner_otw_at = CASE WHEN $1 = 'on_the_way' THEN NOW() ELSE cleaner_otw_at END,
              cleaner_arrived_at = CASE WHEN $1 = 'in_progress' AND cleaner_arrived_at IS NULL THEN NOW() ELSE cleaner_arrived_at END,
              started_at = CASE WHEN $1 = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
              completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
        WHERE id = $2::uuid AND cleaner_id = $3::uuid AND status IN (${fromCsv})`,
      body.to, id, user.id,
    );
    if (Number(updated) === 0) {
      throw new BadRequestException('Transisi status tidak diizinkan dari status saat ini.');
    }

    // Auto-credit cleaner kalau completed (sama logic dgn admin force-complete)
    if (body.to === 'completed') {
      const b = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_payout: number | null }[]>`
        SELECT customer_id, cleaner_payout FROM bookings WHERE id = ${id}::uuid LIMIT 1
      `;
      const booking = b[0];
      if (booking?.cleaner_payout && Number(booking.cleaner_payout) > 0) {
        await this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${user.id}::uuid, 'earnings', ${booking.cleaner_payout}::bigint, 'booking', ${id}::uuid,
                  'CLEARED', NOW(), 'Pembayaran job completed')
          ON CONFLICT DO NOTHING
        `;
        await this.prisma.$executeRaw`
          UPDATE cleaner_profiles SET total_jobs_done = total_jobs_done + 1 WHERE user_id = ${user.id}::uuid
        `;
      }
      // Notify customer to rate
      if (booking?.customer_id) {
        void this.push.send({
          userId: booking.customer_id, channel: 'booking',
          title: 'Pesanan selesai', body: 'Yuk beri rating untuk cleaner kamu!',
          data: { type: 'booking_completed', bookingId: id },
        }).catch(() => {});
      }
    } else {
      // Push notif customer pada setiap transisi
      const b = await this.prisma.$queryRaw<{ customer_id: string | null }[]>`
        SELECT customer_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
      `;
      const titles: Record<string, { title: string; body: string }> = {
        on_the_way: { title: 'Cleaner menuju lokasi 🚗', body: 'Cleaner kamu sudah berangkat. Siapkan akses ya.' },
        in_progress: { title: 'Cleaner sudah sampai ✓', body: 'Pekerjaan dimulai sekarang.' },
      };
      const t = titles[body.to];
      if (b[0]?.customer_id && t) {
        void this.push.send({
          userId: b[0].customer_id, channel: 'booking',
          title: t.title, body: t.body,
          data: { type: 'booking_status_change', bookingId: id, status: body.to },
        }).catch(() => {});
      }
    }
    return { ok: true };
  }
}
