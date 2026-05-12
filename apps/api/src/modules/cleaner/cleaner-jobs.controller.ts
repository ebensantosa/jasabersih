import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { JobsGateway } from '../jobs/jobs.gateway';
import { PushService } from '../notifications/push.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('cleaner-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cleaner/jobs')
export class CleanerJobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsGateway,
    private readonly push: PushService,
    private readonly storage: StorageService,
  ) {}

  // Generate signed PUT URL untuk upload foto before/after ke R2 public bucket
  @Post(':id/photo-upload-url')
  async photoUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { photoType: 'before' | 'after' | 'damage'; contentType: string },
  ) {
    if (!['before', 'after', 'damage'].includes(body?.photoType)) throw new BadRequestException('photoType invalid.');
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(body?.contentType)) throw new BadRequestException('contentType invalid.');
    const owns = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    if (!owns[0]) throw new ForbiddenException('Bukan job kamu.');
    return this.storage.createUploadUrl({
      bucket: 'public',
      keyPrefix: `bookings/${id}/${body.photoType}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
  }

  // Register uploaded photo
  @Post(':id/photos')
  async addPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { photoType: 'before' | 'after' | 'damage'; storagePath: string },
  ) {
    if (!body?.storagePath) throw new BadRequestException('storagePath wajib.');
    const owns = await this.prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    if (!owns[0]) throw new ForbiddenException('Bukan job kamu.');
    if (!['matched', 'on_the_way', 'in_progress', 'completed'].includes(owns[0].status)) {
      throw new BadRequestException('Tidak bisa upload foto di status ini.');
    }
    await this.prisma.$executeRaw`
      INSERT INTO booking_photos (booking_id, photo_type, uploaded_by, storage_path)
      VALUES (${id}::uuid, ${body.photoType}, ${user.id}::uuid, ${body.storagePath})
    `;
    return { ok: true, publicUrl: this.storage.getPublicUrl(body.storagePath) };
  }

  // List photos for a booking (both customer + cleaner can view)
  @Get(':id/photos')
  async listPhotos(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const owns = await this.prisma.$queryRaw<{ customer_id: string; cleaner_id: string | null }[]>`
      SELECT customer_id, cleaner_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const b = owns[0];
    if (!b) throw new ForbiddenException();
    if (b.customer_id !== user.id && b.cleaner_id !== user.id) throw new ForbiddenException();
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, photo_type AS "photoType", storage_path AS "storagePath",
             uploaded_at AS "uploadedAt"
        FROM booking_photos WHERE booking_id = ${id}::uuid
        ORDER BY uploaded_at ASC
    `;
    return rows.map((r) => ({ ...r, url: this.storage.getPublicUrl(r.storagePath as string) }));
  }

  // List bookings searching that this cleaner can take.
  // Filter by service_areas: if cleaner has set areas, only show jobs whose
  // address_line contains any of those area strings. Empty/null areas → show all
  // (don't block onboarding cleaners who haven't set their coverage yet).
  @Get('available')
  async available(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.prisma.$queryRaw<{ kyc_status: string | null; service_areas: any; brings_tools: boolean | null }[]>`
      SELECT kyc_status, service_areas, brings_tools
        FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    if (profile[0]?.kyc_status !== 'approved') return [];

    const rawAreas = profile[0]?.service_areas;
    const areas: string[] = Array.isArray(rawAreas)
      ? rawAreas.filter((a) => typeof a === 'string' && a.trim().length > 0)
      : [];

    // NOTE: kolom total_amount sengaja TIDAK di-expose ke cleaner.
    // Compute estimated cleaner_payout on-the-fly via commission_tiers
    // — kolom cleaner_payout di bookings baru di-set saat accept, jadi
    // sebelum itu null/0 → cleaner gak tau bagiannya.
    const bringsTools = !!profile[0]?.brings_tools;
    const tiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
      SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools
        FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
    `;
    function estPayout(total: number): number {
      const tier = tiers.find((t) => total >= Number(t.range_min ?? 0) && (t.range_max == null || total <= Number(t.range_max)));
      const pct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
      return Math.round(total * pct / 100);
    }

    const rows = await this.prisma.$queryRaw<{ id: string; pricingMode: string; addressLine: string; scheduledAt: Date; totalAmount: number; cleanerPayout: number | null; serviceName: string | null; serviceIconUrl: string | null }[]>`
      SELECT b.id, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt",
             b.total_amount AS "totalAmount",
             b.cleaner_payout AS "cleanerPayout",
             s.name AS "serviceName", s.icon_url AS "serviceIconUrl"
        FROM bookings b LEFT JOIN services s ON s.id = b.service_id
       WHERE b.status = 'searching' AND b.cleaner_id IS NULL
       ORDER BY b.created_at DESC LIMIT 50
    `;
    // Strip totalAmount sebelum return ke cleaner; replace cleanerPayout
    // with estimated value if the booking row hasn't been computed yet.
    const enriched = rows.map((r) => {
      const { totalAmount, ...rest } = r;
      const computed = r.cleanerPayout && Number(r.cleanerPayout) > 0
        ? Number(r.cleanerPayout)
        : estPayout(Number(totalAmount ?? 0));
      return { ...rest, cleanerPayout: computed };
    });

    // HARD FILTER: cleaner yang sudah pilih area cuma lihat job di area mereka.
    // Cegah cleaner Jakarta dapat customer Yogyakarta. Cleaner yang belum
    // pilih area sama sekali (areas=[]) tetap lihat semua (biar gak block
    // onboarding flow).
    if (areas.length === 0) return enriched;
    const lcAreas = areas.map((a) => a.toLowerCase());
    return enriched.filter((r) => {
      const addr = String(r.addressLine ?? '').toLowerCase();
      return lcAreas.some((a) => addr.includes(a));
    });
  }

  // Active jobs assigned to this cleaner (not completed/cancelled)
  @Get('active')
  async active(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.status, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt",
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
    const profile = await this.prisma.$queryRaw<{ kyc_status: string | null; service_areas: any }[]>`
      SELECT kyc_status, service_areas FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    if (profile[0]?.kyc_status !== 'approved') throw new ForbiddenException('KYC belum approved.');

    // Defense in depth: re-check area at accept time so cleaner can't bypass
    // the /available filter via direct API call.
    const rawAreas = profile[0]?.service_areas;
    const areas: string[] = Array.isArray(rawAreas)
      ? rawAreas.filter((a: any) => typeof a === 'string' && a.trim().length > 0)
      : [];
    if (areas.length > 0) {
      const addrRow = await this.prisma.$queryRaw<{ address_line: string | null }[]>`
        SELECT address_line FROM bookings WHERE id = ${id}::uuid LIMIT 1
      `;
      const addr = String(addrRow[0]?.address_line ?? '').toLowerCase();
      const inArea = areas.some((a) => addr.includes(a.toLowerCase()));
      if (!inArea) throw new ForbiddenException('Job ini di luar area layananmu.');
    }

    const updated = await this.prisma.$executeRaw`
      UPDATE bookings
         SET cleaner_id = ${user.id}::uuid, status = 'matched', matched_at = NOW()
       WHERE id = ${id}::uuid AND cleaner_id IS NULL AND status = 'searching'
    `;
    if (Number(updated) === 0) throw new BadRequestException('Job sudah diambil cleaner lain.');

    // Compute cleaner_payout from commission_tiers based on cleaner.brings_tools
    // and total_amount. Without this, completion won't credit the wallet ledger.
    const ctx = await this.prisma.$queryRaw<{ total: number; brings_tools: boolean | null }[]>`
      SELECT b.total_amount AS total, cp.brings_tools
        FROM bookings b
        LEFT JOIN cleaner_profiles cp ON cp.user_id = ${user.id}::uuid
       WHERE b.id = ${id}::uuid LIMIT 1
    `;
    const total = Number(ctx[0]?.total ?? 0);
    const bringsTools = !!ctx[0]?.brings_tools;
    const tiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
      SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools
        FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
    `;
    const tier = tiers.find((t) => total >= Number(t.range_min ?? 0) && (t.range_max == null || total <= Number(t.range_max)));
    const sharePct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
    const payout = Math.round(total * sharePct / 100);
    if (payout > 0) {
      await this.prisma.$executeRaw`
        UPDATE bookings SET cleaner_payout = ${payout}::bigint WHERE id = ${id}::uuid
      `;
    }

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

    // Photo enforcement: cek ada foto required sebelum transisi
    if (body.to === 'in_progress') {
      const before = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM booking_photos
         WHERE booking_id = ${id}::uuid AND photo_type = 'before'
      `;
      if (Number(before[0]?.c ?? 0) === 0) {
        throw new BadRequestException({
          code: 'BEFORE_PHOTO_REQUIRED',
          message: 'Upload minimal 1 foto kondisi SEBELUM (before) dulu sebelum mulai kerja.',
        });
      }
    }
    if (body.to === 'completed') {
      const after = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM booking_photos
         WHERE booking_id = ${id}::uuid AND photo_type = 'after'
      `;
      if (Number(after[0]?.c ?? 0) === 0) {
        throw new BadRequestException({
          code: 'AFTER_PHOTO_REQUIRED',
          message: 'Upload minimal 1 foto kondisi SESUDAH (after) dulu sebelum tandai selesai.',
        });
      }
    }

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
