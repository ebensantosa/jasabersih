import { BadRequestException, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
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
}
