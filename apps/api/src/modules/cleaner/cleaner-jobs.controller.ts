import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CleanerGuard } from '../auth/role.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { JobsGateway } from '../jobs/jobs.gateway';
import { PushService } from '../notifications/push.service';
import { ReferralPayoutService } from '../referral/referral-payout.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('cleaner-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CleanerGuard)
@Controller('cleaner/jobs')
export class CleanerJobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsGateway,
    private readonly push: PushService,
    private readonly storage: StorageService,
    private readonly referralPayout: ReferralPayoutService,
  ) {}

  private async syncPhotoLookupColumn(bookingId: string, type: 'before' | 'after') {
    const rows = await this.prisma.$queryRaw<{ storage_path: string }[]>`
      SELECT storage_path
        FROM booking_photos
       WHERE booking_id = ${bookingId}::uuid
         AND photo_type = ${type}
       ORDER BY uploaded_at DESC
       LIMIT 1
    `;
    const col = type === 'before' ? 'before_photo_url' : 'after_photo_url';
    const publicUrl = rows[0]?.storage_path ? this.storage.getPublicUrl(rows[0].storage_path) : null;
    await this.prisma.$executeRawUnsafe(
      `UPDATE bookings SET ${col} = $1 WHERE id = $2::uuid`,
      publicUrl,
      bookingId,
    );
  }

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
    @Body() body: { photoType: 'before' | 'after' | 'damage'; storagePath: string; description?: string },
  ) {
    if (!body?.storagePath) throw new BadRequestException('storagePath wajib.');
    // Damage WAJIB punya deskripsi alasan (min 10 char). Foto aja gak cukup
    // konteks utk admin/customer review sengketa.
    if (body.photoType === 'damage' && (!body.description || body.description.trim().length < 10)) {
      throw new BadRequestException('Deskripsi kerusakan wajib (min 10 karakter).');
    }
    const owns = await this.prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    if (!owns[0]) throw new ForbiddenException('Bukan job kamu.');
    if (!['matched', 'on_the_way', 'in_progress'].includes(owns[0].status)) {
      throw new BadRequestException('Tidak bisa upload foto di status ini.');
    }
    await this.prisma.$executeRaw`
      INSERT INTO booking_photos (booking_id, photo_type, uploaded_by, storage_path, description)
      VALUES (${id}::uuid, ${body.photoType}, ${user.id}::uuid, ${body.storagePath}, ${body.description ?? null})
    `;
    // Quick lookup column (untuk validasi require_after_photo / before_photo).
    if (body.photoType === 'before' || body.photoType === 'after') {
      await this.syncPhotoLookupColumn(id, body.photoType);
    }
    return { ok: true, publicUrl: this.storage.getPublicUrl(body.storagePath) };
  }

  @Delete(':id/photos/:photoId')
  async deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    const owns = await this.prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    if (!owns[0]) throw new ForbiddenException('Bukan job kamu.');
    if (owns[0].status !== 'in_progress') {
      throw new BadRequestException('Foto hanya bisa dihapus saat pekerjaan masih berjalan.');
    }

    const rows = await this.prisma.$queryRaw<{ id: string; photo_type: 'before' | 'after' | 'damage'; storage_path: string; uploaded_by: string | null }[]>`
      SELECT id, photo_type, storage_path, uploaded_by
        FROM booking_photos
       WHERE id = ${photoId}::uuid
         AND booking_id = ${id}::uuid
       LIMIT 1
    `;
    const photo = rows[0];
    if (!photo) throw new BadRequestException('Foto tidak ditemukan.');
    if (photo.uploaded_by && photo.uploaded_by !== user.id) {
      throw new ForbiddenException('Kamu tidak bisa hapus foto milik user lain.');
    }

    await this.storage.deleteObject('public', photo.storage_path);
    await this.prisma.$executeRaw`
      DELETE FROM booking_photos WHERE id = ${photoId}::uuid
    `;
    if (photo.photo_type === 'before' || photo.photo_type === 'after') {
      await this.syncPhotoLookupColumn(id, photo.photo_type);
    }
    return { ok: true };
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
    const profile = await this.prisma.$queryRaw<{ kyc_status: string | null; service_areas: any; brings_tools: boolean | null; is_available: boolean | null }[]>`
      SELECT kyc_status, service_areas, brings_tools, is_available
        FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    if (profile[0]?.kyc_status !== 'approved') return [];
    // Cleaner WAJIB online sebelum bisa lihat list job. Gak ada gunanya
    // browse job kalau offline (gak akan dpt notif baru, dan tap accept
    // toh ditolak di endpoint /accept).
    if (!profile[0]?.is_available) return [];

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

    const rows = await this.prisma.$queryRaw<{ id: string; pricingMode: string; addressLine: string; cityName: string | null; scheduledAt: Date; createdAt: Date; totalAmount: number; cleanerPayout: number | null; serviceName: string | null; serviceIconUrl: string | null; formSnapshot: any; customerNotes: string | null }[]>`
      SELECT b.id, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.form_snapshot->>'cityName' AS "cityName",
             b.scheduled_at AS "scheduledAt",
             b.created_at AS "createdAt",
             b.total_amount AS "totalAmount",
             b.cleaner_payout AS "cleanerPayout",
             COALESCE(s.name, pp.name, ht.name, NULLIF(b.form_snapshot->>'packageName', ''), NULLIF(b.form_snapshot->>'tierName', ''), NULLIF(b.form_snapshot->>'categoryName', ''), 'Layanan') AS "serviceName",
             s.icon_url AS "serviceIconUrl",
             b.form_snapshot AS "formSnapshot",
             b.customer_notes AS "customerNotes"
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN pricing_packages pp ON pp.id = b.package_id
        LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
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
    // Cek addressLine DAN cityName supaya booking dengan alamat pendek (misal
    // "Jl Kusniii") tetap match kalau cityName-nya cocok (misal "Yogyakarta").
    if (areas.length === 0) return enriched;
    const lcAreas = areas.map((a) => a.toLowerCase());
    return enriched.filter((r) => {
      const addr = String(r.addressLine ?? '').toLowerCase();
      const city = String(r.cityName ?? '').toLowerCase();
      return lcAreas.some((a) => addr.includes(a) || (city.length > 0 && city.includes(a)));
    });
  }

  // Active jobs assigned to this cleaner (not completed/cancelled)
  @Get('active')
  async active(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.status, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt",
             b.cleaner_payout AS "cleanerPayout",
             b.hours_booked AS "hoursBooked",
             b.started_at AS "startedAt",
             b.pause_started_at AS "pauseStartedAt",
             b.paused_total_sec AS "pausedTotalSec",
             ht.price_per_hour AS "hourlyPricePerHour",
             CASE WHEN b.pricing_mode = 'hourly'
               THEN COALESCE(
                 CASE WHEN b.hours_booked IS NOT NULL
                   THEN CASE WHEN b.hours_booked < 1
                     THEN (b.hours_booked * 60)::int::text || ' Menit'
                     ELSE b.hours_booked::text || ' Jam'
                   END
                 END,
                 ht.name, 'Layanan Per Jam')
               ELSE COALESCE(s.name, pp.name, NULLIF(b.form_snapshot->>'packageName', ''), NULLIF(b.form_snapshot->>'categoryName', ''), 'Layanan')
             END AS "serviceName",
             s.icon_url AS "serviceIcon",
             pp.name AS "packageName",
             ht.name AS "hourlyTierName",
             u.name AS "customerName"
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN pricing_packages pp ON pp.id = b.package_id
        LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
        LEFT JOIN users u ON u.id = b.customer_id
       WHERE b.cleaner_id = ${user.id}::uuid
         AND b.status IN ('matched', 'cleaner_otw', 'on_the_way', 'in_progress', 'started')
       ORDER BY b.scheduled_at ASC LIMIT 50
    `;
  }

  @Get('history')
  async history(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.status, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt",
             b.cleaner_payout AS "cleanerPayout",
             b.completed_at AS "completedAt",
             b.canceled_at AS "canceledAt",
             b.created_at AS "createdAt",
             COALESCE(s.name, pp.name, ht.name, NULLIF(b.form_snapshot->>'packageName', ''), NULLIF(b.form_snapshot->>'tierName', ''), NULLIF(b.form_snapshot->>'categoryName', ''), 'Layanan') AS "serviceName",
             s.icon_url AS "serviceIcon",
             pp.name AS "packageName",
             ht.name AS "hourlyTierName",
             u.name AS "customerName"
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN pricing_packages pp ON pp.id = b.package_id
        LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
        LEFT JOIN users u ON u.id = b.customer_id
       WHERE b.cleaner_id = ${user.id}::uuid
         AND b.status IN ('completed', 'canceled', 'cancelled', 'failed', 'rejected')
       ORDER BY COALESCE(b.completed_at, b.canceled_at, b.created_at) DESC
       LIMIT 100
    `;
  }

  // GET /cleaner/jobs/calendar?month=YYYY-MM — daftar jobs yg di-assign cleaner di bulan tertentu
  // untuk render kalender bulanan
  @Get('calendar')
  async calendar(@CurrentUser() user: AuthenticatedUser, @Query('month') monthStr?: string) {
    // Format YYYY-MM. Default = bulan ini.
    const today = new Date();
    const month = monthStr && /^\d{4}-\d{2}$/.test(monthStr)
      ? monthStr
      : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const [yy, mm] = month.split('-').map((s) => Number(s));
    const start = new Date(Date.UTC(yy!, mm! - 1, 1));
    const end = new Date(Date.UTC(yy!, mm!, 1));
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.status, b.scheduled_at AS "scheduledAt",
             b.cleaner_payout AS "cleanerPayout",
             b.address_line AS "addressLine",
             COALESCE(s.name, pp.name, ht.name, NULLIF(b.form_snapshot->>'packageName', ''), NULLIF(b.form_snapshot->>'tierName', ''), NULLIF(b.form_snapshot->>'categoryName', ''), 'Layanan') AS "serviceName",
             u.name AS "customerName"
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN pricing_packages pp ON pp.id = b.package_id
        LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
        LEFT JOIN users u ON u.id = b.customer_id
       WHERE b.cleaner_id = ${user.id}::uuid
         AND b.scheduled_at >= ${start}::timestamptz
         AND b.scheduled_at < ${end}::timestamptz
         AND b.status NOT IN ('canceled', 'rejected')
       ORDER BY b.scheduled_at ASC
    `;
  }

  // HTTP fallback untuk accept (kalau socket ga konek). Atomic, race-safe.
  // POST /cleaner/jobs/:id/refuse — log alasan cleaner tolak job offer
  // Untuk fraud detection (cleaner sama selalu tolak customer X = suspect side-deal)
  // + tuning matching algorithm (60% tolak "jauh" = perlu adjust radius).
  @Post(':id/refuse')
  async refuse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reasonCode: string; note?: string },
  ) {
    const code = (body?.reasonCode ?? '').trim();
    const allowed = ['off', 'jauh', 'bentrok', 'service_unfamiliar', 'customer_issue', 'other'];
    if (!allowed.includes(code)) throw new BadRequestException('Reason code tidak valid');
    const note = (body?.note ?? '').trim().slice(0, 500);

    await this.prisma.$executeRaw`
      INSERT INTO job_offer_refusals (cleaner_id, booking_id, reason_code, reason_note)
      VALUES (${user.id}::uuid, ${id}::uuid, ${code}, ${note || null})
    `;
    return { ok: true };
  }

  @Post(':id/accept')
  async accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const profile = await this.prisma.$queryRaw<{ kyc_status: string | null; service_areas: any; is_available: boolean | null }[]>`
      SELECT kyc_status, service_areas, is_available FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    if (profile[0]?.kyc_status !== 'approved') throw new ForbiddenException('KYC belum approved.');
    if (!profile[0]?.is_available) throw new ForbiddenException('Aktifkan mode Online dulu sebelum ambil job.');

    // Defense in depth: re-check area at accept time so cleaner can't bypass
    // the /available filter via direct API call.
    const rawAreas = profile[0]?.service_areas;
    const areas: string[] = Array.isArray(rawAreas)
      ? rawAreas.filter((a: any) => typeof a === 'string' && a.trim().length > 0)
      : [];
    if (areas.length > 0) {
      const addrRow = await this.prisma.$queryRaw<{ address_line: string | null; city_name: string | null }[]>`
        SELECT address_line, form_snapshot->>'cityName' AS city_name FROM bookings WHERE id = ${id}::uuid LIMIT 1
      `;
      const addr = String(addrRow[0]?.address_line ?? '').toLowerCase();
      const city = String(addrRow[0]?.city_name ?? '').toLowerCase();
      const inArea = areas.some((a) => {
        const lc = a.toLowerCase();
        return addr.includes(lc) || (city.length > 0 && city.includes(lc));
      });
      if (!inArea) throw new ForbiddenException('Job ini di luar area layananmu.');
    }

    // Anti double-book: cek jadwal cleaner gak overlap dengan booking lain (window ±2 jam).
    const jobSched = await this.prisma.$queryRaw<{ scheduled_at: Date | null }[]>`
      SELECT scheduled_at FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const schedAt = jobSched[0]?.scheduled_at;
    if (schedAt) {
      const conflict = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM bookings
         WHERE cleaner_id = ${user.id}::uuid
           AND status IN ('matched', 'on_the_way', 'cleaner_otw', 'in_progress', 'started')
           AND scheduled_at IS NOT NULL
           AND ABS(EXTRACT(EPOCH FROM (scheduled_at - ${schedAt}::timestamptz))) < 7200
         LIMIT 1
      `;
      if (conflict.length > 0) {
        throw new BadRequestException('Kamu sudah punya job di jam yang dekat. Selesaikan dulu sebelum ambil yang baru.');
      }

      // Cek working hours kalau ada di-set (table mungkin belum ada di env lama)
      try {
        const dayOfWeek = new Date(schedAt).getDay();
        const minutesOfDay = new Date(schedAt).getHours() * 60 + new Date(schedAt).getMinutes();
        const wh = await this.prisma.$queryRaw<{ start_minute: number; end_minute: number }[]>`
          SELECT start_minute, end_minute FROM cleaner_working_hours
           WHERE user_id = ${user.id}::uuid AND day_of_week = ${dayOfWeek}
        `;
        if (wh.length > 0) {
          const inHours = wh.some((s) => minutesOfDay >= s.start_minute && minutesOfDay < s.end_minute);
          if (!inHours) {
            throw new BadRequestException('Job ini di luar jam kerjamu. Atur jam kerja di profile.');
          }
        }
      } catch (e: any) {
        if (e?.status) throw e; // BadRequestException dari dalam try — rethrow
        // DB error (table not exist, etc.) — skip check, jangan block accept
      }
    }

    const updated = await this.prisma.$executeRaw`
      UPDATE bookings
         SET cleaner_id = ${user.id}::uuid, status = 'matched', matched_at = NOW()
       WHERE id = ${id}::uuid AND cleaner_id IS NULL AND status = 'searching'
    `;
    if (Number(updated) === 0) throw new BadRequestException('Job sudah diambil cleaner lain.');

    // Compute cleaner_payout = (base × share%) + (travel_fee × 100%)
    // Travel fee 100% ke cleaner (bensin/transport), gak kena cut platform.
    // Per-jam: pakai cleaner_share_pct dari pricing_hourly_tiers (admin-controlled).
    // Per-ruangan: pakai commission_tiers berdasarkan range base amount.
    const ctx = await this.prisma.$queryRaw<{ base: number; travel: number; brings_tools: boolean | null; pricing_mode: string | null; hourly_share_pct: number | null; existing_payout: number | null }[]>`
      SELECT COALESCE(b.base_amount, b.total_amount) AS base,
             COALESCE(b.travel_fee, 0) AS travel,
             cp.brings_tools,
             b.pricing_mode,
             ht.cleaner_share_pct AS hourly_share_pct,
             b.cleaner_payout AS existing_payout
        FROM bookings b
        LEFT JOIN cleaner_profiles cp ON cp.user_id = ${user.id}::uuid
        LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
       WHERE b.id = ${id}::uuid LIMIT 1
    `;
    // Jika cleaner_payout sudah ada (booking warranty redo), pakai nilai asli — jangan overwrite
    if (Number(ctx[0]?.existing_payout ?? 0) <= 0) {
      const base = Number(ctx[0]?.base ?? 0);
      const travel = Number(ctx[0]?.travel ?? 0);
      const bringsTools = !!ctx[0]?.brings_tools;
      const isHourly = ctx[0]?.pricing_mode === 'hourly';
      let sharePct: number;
      if (isHourly && ctx[0]?.hourly_share_pct != null) {
        sharePct = Number(ctx[0].hourly_share_pct);
      } else {
        const tiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
          SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools
            FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
        `;
        const tier = tiers.find((t) => base >= Number(t.range_min ?? 0) && (t.range_max == null || base <= Number(t.range_max)));
        sharePct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
      }
      const payout = Math.round(base * sharePct / 100) + travel;
      if (payout > 0) {
        await this.prisma.$executeRaw`
          UPDATE bookings SET cleaner_payout = ${payout}::bigint WHERE id = ${id}::uuid
        `;
      }
    }

    const b = await this.prisma.$queryRaw<{ customer_id: string }[]>`
      SELECT customer_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    // Notify other online cleaners so their job popup closes immediately
    this.jobs.emitJobTaken(id, user.id);

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
    const bookingRows = await this.prisma.$queryRaw<{ status: string; customer_id: string | null; pause_started_at: Date | null }[]>`
      SELECT status, customer_id, pause_started_at
        FROM bookings
       WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid
       LIMIT 1
    `;
    const currentBooking = bookingRows[0];
    if (!currentBooking) throw new ForbiddenException('Bukan job kamu.');

    const allowedFrom: Record<string, string[]> = {
      on_the_way: ['matched'],
      in_progress: ['on_the_way'],
      completed: ['in_progress'],
    };
    const fromList = allowedFrom[body.to];
    if (!fromList) throw new BadRequestException('Status target invalid.');

    // Photo enforcement: cek ada foto required sebelum transisi
    if (body.to === 'completed') {
      if (currentBooking.pause_started_at) {
        throw new BadRequestException('Lanjutkan timer dulu sebelum tandai job selesai.');
      }
      // Block kalau masih ada upcharge yang belum di-decide customer (pending).
      // Charge wajib disetujui & dibayar (status='approved') atau ditolak/cancel
      // sebelum job bisa selesai. Cegah cleaner skip charge resolution.
      const pendingCharges = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM booking_upcharges
         WHERE booking_id = ${id}::uuid AND status = 'pending'
      `;
      if (Number(pendingCharges[0]?.c ?? 0) > 0) {
        throw new BadRequestException({
          code: 'UPCHARGE_UNRESOLVED',
          message: 'Ada permintaan charge yang menunggu keputusan customer. Tunggu customer setujui/tolak dulu sebelum tandai selesai.',
        });
      }
      const before = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM booking_photos
         WHERE booking_id = ${id}::uuid AND photo_type = 'before'
      `;
      if (Number(before[0]?.c ?? 0) === 0) {
        throw new BadRequestException({
          code: 'BEFORE_PHOTO_REQUIRED',
          message: 'Upload minimal 1 foto kondisi SEBELUM (before) dulu sebelum tandai selesai.',
        });
      }
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

    // Foto AFTER wajib sebelum tandai selesai (admin-configurable via cleaner.require_after_photo).
    if (body.to === 'completed') {
      const cfg = await this.prisma.$queryRaw<{ value: any }[]>`
        SELECT value FROM app_config WHERE key = 'cleaner.require_after_photo' LIMIT 1
      `;
      const req = (() => {
        const v = cfg[0]?.value;
        if (v == null) return true; // default wajib
        const s = typeof v === 'string' ? v.replace(/"/g, '').toLowerCase() : String(v).toLowerCase();
        return s === 'true' || s === '1';
      })();
      if (req) {
        const photo = await this.prisma.$queryRaw<{ after_photo_url: string | null }[]>`
          SELECT after_photo_url FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
        `;
        if (!photo[0]?.after_photo_url) {
          throw new BadRequestException('Foto AFTER wajib diupload sebelum tandai selesai.');
        }
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
              completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
              pause_started_at = CASE WHEN $1 = 'completed' THEN NULL ELSE pause_started_at END
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
      let booking = b[0];

      // Safety net: cleaner_payout belum ter-set (accept via socket sebelum fix deploy)
      // → hitung sekarang sebelum buat wallet entry supaya tidak hilang
      if (!booking?.cleaner_payout || Number(booking.cleaner_payout) <= 0) {
        const ctx = await this.prisma.$queryRaw<{ base: number; travel: number; brings_tools: boolean | null; pricing_mode: string | null; hourly_share_pct: number | null }[]>`
          SELECT COALESCE(bk.base_amount, bk.total_amount) AS base,
                 COALESCE(bk.travel_fee, 0) AS travel,
                 cp.brings_tools,
                 bk.pricing_mode,
                 ht.cleaner_share_pct AS hourly_share_pct
            FROM bookings bk
            LEFT JOIN cleaner_profiles cp ON cp.user_id = ${user.id}::uuid
            LEFT JOIN pricing_hourly_tiers ht ON ht.id = bk.hourly_tier_id
           WHERE bk.id = ${id}::uuid LIMIT 1
        `;
        if (ctx[0]) {
          const base = Number(ctx[0].base ?? 0);
          const travel = Number(ctx[0].travel ?? 0);
          const bringsTools = !!ctx[0].brings_tools;
          const isHourly = ctx[0].pricing_mode === 'hourly';
          let sharePct: number;
          if (isHourly && ctx[0].hourly_share_pct != null) {
            sharePct = Number(ctx[0].hourly_share_pct);
          } else {
            const tiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
              SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools
                FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
            `;
            const tier = tiers.find((t) => base >= Number(t.range_min ?? 0) && (t.range_max == null || base <= Number(t.range_max)));
            sharePct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
          }
          const payout = Math.round(base * sharePct / 100) + travel;
          if (payout > 0) {
            await this.prisma.$executeRaw`UPDATE bookings SET cleaner_payout = ${payout}::bigint WHERE id = ${id}::uuid`;
            const b2 = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_payout: number | null }[]>`
              SELECT customer_id, cleaner_payout FROM bookings WHERE id = ${id}::uuid LIMIT 1
            `;
            if (b2[0]) booking = b2[0];
          }
        }
      }

      if (booking?.cleaner_payout && Number(booking.cleaner_payout) > 0) {
        // Split payout antara lead + helpers (kalau ada).
        const helpers = await this.prisma.$queryRaw<{ cleaner_id: string }[]>`
          SELECT cleaner_id FROM booking_helpers
           WHERE booking_id = ${id}::uuid AND status = 'accepted'
        `;
        const totalWorkers = 1 + helpers.length;
        const perWorker = Math.floor(Number(booking.cleaner_payout) / totalWorkers);

        // Lead (caller).
        await this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${user.id}::uuid, 'earnings', ${perWorker}::bigint, 'booking', ${id}::uuid,
                  'PENDING', NULL, ${`Earning job (lead, 1/${totalWorkers}) — escrow 24 jam`})
          ON CONFLICT DO NOTHING
        `;
        await this.prisma.$executeRaw`
          UPDATE cleaner_profiles SET total_jobs_done = total_jobs_done + 1 WHERE user_id = ${user.id}::uuid
        `;

        // Helpers.
        for (const h of helpers) {
          await this.prisma.$executeRaw`
            INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
            VALUES (${h.cleaner_id}::uuid, 'earnings', ${perWorker}::bigint, 'booking_helper', ${id}::uuid,
                    'PENDING', NULL, ${`Earning job (helper, 1/${totalWorkers}) — escrow 24 jam`})
            ON CONFLICT DO NOTHING
          `;
          await this.prisma.$executeRaw`
            UPDATE cleaner_profiles SET total_jobs_done = total_jobs_done + 1 WHERE user_id = ${h.cleaner_id}::uuid
          `;
        }
      }
      // Kalau ini complete setelah re-clean, mark 'done' biar UI tau alur selesai.
      await this.prisma.$executeRaw`
        UPDATE bookings SET reclean_status = 'done'
         WHERE id = ${id}::uuid AND reclean_status = 'accepted'
      `;

      // Referral commission (NEW model): 5% recurring tiap order completed.
      // Idempotency + admin config (referral.commission_pct) di ReferralPayoutService.
      await this.referralPayout.payoutForCompletedBooking(id);
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

  @Post(':id/timer')
  async updateTimer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { action: 'pause' | 'resume' },
  ) {
    if (!['pause', 'resume'].includes(body?.action)) {
      throw new BadRequestException('Aksi timer tidak valid.');
    }
    const rows = await this.prisma.$queryRaw<{
      pricing_mode: string;
      status: string;
      started_at: Date | null;
      pause_started_at: Date | null;
      paused_total_sec: number | null;
    }[]>`
      SELECT pricing_mode, status, started_at, pause_started_at, paused_total_sec
        FROM bookings
       WHERE id = ${id}::uuid
         AND cleaner_id = ${user.id}::uuid
       LIMIT 1
    `;
    const booking = rows[0];
    if (!booking) throw new ForbiddenException('Bukan job kamu.');
    if (booking.pricing_mode !== 'hourly') throw new BadRequestException('Timer jeda hanya untuk layanan per jam.');
    if (booking.status !== 'in_progress' || !booking.started_at) {
      throw new BadRequestException('Timer hanya bisa diatur saat pekerjaan sedang berjalan.');
    }

    if (body.action === 'pause') {
      if (booking.pause_started_at) throw new BadRequestException('Timer sudah dijeda.');
      await this.prisma.$executeRaw`
        UPDATE bookings
           SET pause_started_at = NOW()
         WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid
      `;
      return { ok: true, paused: true };
    }

    if (!booking.pause_started_at) throw new BadRequestException('Timer tidak sedang dijeda.');
    const pausedSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(booking.pause_started_at).getTime()) / 1000),
    );
    await this.prisma.$executeRaw`
      UPDATE bookings
         SET paused_total_sec = COALESCE(paused_total_sec, 0) + ${pausedSeconds},
             pause_started_at = NULL
       WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid
    `;
    return { ok: true, paused: false };
  }

  // ============ UPCHARGE: cleaner minta charge tambahan ============

  // Presigned upload URL untuk foto bukti kondisi (optional, recommended)
  @Post(':id/upcharge-photo-upload-url')
  async upchargePhotoUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { contentType: string },
  ) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(body?.contentType)) {
      throw new BadRequestException(`contentType harus: ${allowed.join(', ')}`);
    }
    const owns = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    if (!owns[0]) throw new ForbiddenException('Bukan job kamu.');
    const r = await this.storage.createUploadUrl({
      bucket: 'public',
      keyPrefix: `upcharges/${id}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
    return { ...r, publicUrl: this.storage.getPublicUrl(r.key) };
  }

  // Helper: hitung share cleaner untuk nominal tertentu, pakai tier sesuai total booking
  private async computeCleanerShare(bookingTotal: number, cleanerUserId: string, amount: number): Promise<{ cleanerShare: number; platformFee: number; pct: number }> {
    const prof = await this.prisma.$queryRaw<{ brings_tools: boolean }[]>`
      SELECT brings_tools FROM cleaner_profiles WHERE user_id = ${cleanerUserId}::uuid LIMIT 1
    `;
    const bringsTools = !!prof[0]?.brings_tools;
    const tiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
      SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools
        FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
    `;
    const tier = tiers.find((t) => bookingTotal >= Number(t.range_min ?? 0) && (t.range_max == null || bookingTotal <= Number(t.range_max)));
    const pct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
    const cleanerShare = Math.round(amount * pct / 100);
    const platformFee = amount - cleanerShare;
    return { cleanerShare, platformFee, pct };
  }

  // Preview commission split untuk nominal upcharge (dipakai mobile sebelum submit)
  @Post(':id/upcharge-preview')
  async previewUpcharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { amount: number },
  ) {
    const amount = Math.floor(Number(body?.amount ?? 0));
    if (!amount || amount <= 0) throw new BadRequestException('Nominal harus > 0');
    const rows = await this.prisma.$queryRaw<{ total_amount: number; base_amount: number }[]>`
      SELECT total_amount, base_amount FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    if (!rows[0]) throw new ForbiddenException('Bukan job kamu.');
    return this.computeCleanerShare(Number(rows[0].total_amount), user.id, amount);
  }

  // Cleaner submit upcharge request
  @Post(':id/upcharge')
  async submitUpcharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { amount: number; reason: string; photoUrl?: string },
  ) {
    const amount = Math.floor(Number(body?.amount ?? 0));
    if (!amount || amount <= 0) throw new BadRequestException('Nominal harus > 0');
    if (!body?.reason || body.reason.trim().length < 10) {
      throw new BadRequestException('Alasan min 10 karakter');
    }
    const rows = await this.prisma.$queryRaw<{ id: string; status: string; customer_id: string; total_amount: number; base_amount: number }[]>`
      SELECT id, status, customer_id, total_amount, base_amount
        FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new ForbiddenException('Bukan job kamu.');
    if (!['on_the_way', 'in_progress'].includes(b.status)) {
      throw new BadRequestException('Hanya bisa minta charge tambahan saat OTW/sedang dikerjakan.');
    }
    // Max 50% dari base
    const maxAllowed = Math.floor(Number(b.base_amount) * 0.5);
    if (amount > maxAllowed) {
      throw new BadRequestException(`Nominal melebihi batas maksimum (Rp ${maxAllowed.toLocaleString('id-ID')}). Konsultasi admin via chat jika perlu lebih.`);
    }
    // Anti-spam: 1× pending sekaligus per booking
    const pending = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM booking_upcharges
       WHERE booking_id = ${id}::uuid AND status = 'pending'
    `;
    if (Number(pending[0]?.c ?? 0) > 0) {
      throw new BadRequestException('Sudah ada permintaan charge yang menunggu approval customer.');
    }
    const created = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO booking_upcharges (booking_id, cleaner_id, amount, reason, photo_url, status)
      VALUES (${id}::uuid, ${user.id}::uuid, ${amount}, ${body.reason.trim()}, ${body.photoUrl ?? null}, 'pending')
      RETURNING id
    `;
    // Notif customer
    void this.push.send({
      userId: b.customer_id,
      channel: 'booking',
      title: 'Cleaner minta charge tambahan',
      body: `Cleaner minta +Rp ${amount.toLocaleString('id-ID')}. Tap untuk lihat alasan & setujui/tolak.`,
      data: { type: 'upcharge_requested', bookingId: id, upchargeId: created[0]?.id, amount },
    }).catch(() => {});
    return { id: created[0]?.id, amount, status: 'pending' };
  }

  // GET upcharges per booking (cleaner side)
  @Get(':id/upcharges')
  async listUpcharges(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const owns = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    if (!owns[0]) throw new ForbiddenException('Bukan job kamu.');
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, amount, reason, photo_url AS "photoUrl", status,
             created_at AS "createdAt", decided_at AS "decidedAt"
        FROM booking_upcharges
       WHERE booking_id = ${id}::uuid
       ORDER BY created_at DESC
    `;
  }

  // ===== HELPER INVITES (multi-cleaner jobs) =====

  // POST /cleaner/jobs/:id/invite-helper — lead invite helper by phone.
  // Hanya boleh kalau worker_count >= 2 dan booking sudah di-assign ke caller.
  @Post(':id/invite-helper')
  async inviteHelper(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { phone: string },
  ) {
    if (!body?.phone) throw new BadRequestException('Phone wajib.');
    const digits = body.phone.replace(/\D/g, '');
    const phone = digits.startsWith('62') ? `+${digits}` : digits.startsWith('0') ? `+62${digits.slice(1)}` : `+62${digits}`;

    const rows = await this.prisma.$queryRaw<{ worker_count: number; status: string }[]>`
      SELECT worker_count, status FROM bookings
       WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new ForbiddenException('Kamu bukan lead booking ini.');
    if (b.worker_count < 2) throw new BadRequestException('Booking ini cuma butuh 1 worker.');
    if (!['matched', 'on_the_way', 'cleaner_otw'].includes(b.status)) {
      throw new BadRequestException('Tidak bisa invite di status ini.');
    }

    // Cari helper user via phone — harus cleaner active + KYC approved + bukan self.
    const helper = await this.prisma.$queryRaw<{ id: string; name: string | null }[]>`
      SELECT u.id, u.name FROM users u
        JOIN cleaner_profiles cp ON cp.user_id = u.id
       WHERE u.phone = ${phone}
         AND u.is_freelancer = TRUE
         AND u.status = 'active'
         AND u.deleted_at IS NULL
         AND cp.kyc_status = 'approved'
         AND u.id <> ${user.id}::uuid
       LIMIT 1
    `;
    if (helper.length === 0) throw new BadRequestException('Cleaner dengan nomor ini gak ditemukan / belum approved.');

    // Cek slot helper masih kosong.
    const accepted = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM booking_helpers
       WHERE booking_id = ${id}::uuid AND status = 'accepted'
    `;
    if (Number(accepted[0]?.c ?? 0) >= b.worker_count - 1) {
      throw new BadRequestException('Slot helper sudah penuh.');
    }

    await this.prisma.$executeRaw`
      INSERT INTO booking_helpers (booking_id, cleaner_id, status, invited_by)
      VALUES (${id}::uuid, ${helper[0]!.id}::uuid, 'invited', ${user.id}::uuid)
      ON CONFLICT (booking_id, cleaner_id) DO UPDATE
        SET status = 'invited', invited_at = NOW(), decided_at = NULL
    `;

    void this.push.send({
      userId: helper[0]!.id, channel: 'booking',
      title: 'Diundang bantu job',
      body: 'Ada cleaner ngajak kamu bantu job. Tap untuk lihat detail & terima.',
      data: { type: 'helper_invited', bookingId: id },
    }).catch(() => {});

    return { ok: true, helperId: helper[0]!.id, helperName: helper[0]!.name };
  }

  // GET /cleaner/helper-invites — list invites buat cleaner ini.
  @Get('helper-invites')
  async listHelperInvites(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT h.id, h.booking_id AS "bookingId", h.status, h.invited_at AS "invitedAt",
             b.address_line AS "addressLine", b.scheduled_at AS "scheduledAt",
             b.worker_count AS "workerCount",
             u.name AS "leadName"
        FROM booking_helpers h
        JOIN bookings b ON b.id = h.booking_id
        LEFT JOIN users u ON u.id = h.invited_by
       WHERE h.cleaner_id = ${user.id}::uuid
       ORDER BY h.invited_at DESC LIMIT 50
    `;
  }

  // POST /cleaner/helper-invites/:inviteId/accept
  @Post('helper-invites/:inviteId/accept')
  async acceptHelper(@CurrentUser() user: AuthenticatedUser, @Param('inviteId') inviteId: string) {
    const rows = await this.prisma.$queryRaw<{ booking_id: string; status: string; invited_by: string }[]>`
      SELECT booking_id, status, invited_by FROM booking_helpers
       WHERE id = ${inviteId}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    const h = rows[0];
    if (!h) throw new ForbiddenException('Invite tidak ditemukan.');
    if (h.status !== 'invited') throw new BadRequestException('Invite sudah diputuskan.');

    // Anti double-book check untuk helper juga.
    const sched = await this.prisma.$queryRaw<{ scheduled_at: Date | null }[]>`
      SELECT scheduled_at FROM bookings WHERE id = ${h.booking_id}::uuid LIMIT 1
    `;
    if (sched[0]?.scheduled_at) {
      const conflict = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM bookings
         WHERE cleaner_id = ${user.id}::uuid
           AND status IN ('matched', 'on_the_way', 'cleaner_otw', 'in_progress', 'started')
           AND scheduled_at IS NOT NULL
           AND ABS(EXTRACT(EPOCH FROM (scheduled_at - ${sched[0].scheduled_at}::timestamptz))) < 7200
         LIMIT 1
      `;
      if (conflict.length > 0) throw new BadRequestException('Kamu punya job lain di jam yang dekat.');
    }

    await this.prisma.$executeRaw`
      UPDATE booking_helpers SET status = 'accepted', decided_at = NOW()
       WHERE id = ${inviteId}::uuid AND cleaner_id = ${user.id}::uuid
    `;

    void this.push.send({
      userId: h.invited_by, channel: 'booking',
      title: 'Helper menerima invite',
      body: 'Cleaner yang kamu undang menerima job.',
      data: { type: 'helper_accepted', bookingId: h.booking_id },
    }).catch(() => {});

    return { ok: true };
  }

  // POST /cleaner/helper-invites/:inviteId/decline
  @Post('helper-invites/:inviteId/decline')
  async declineHelper(@CurrentUser() user: AuthenticatedUser, @Param('inviteId') inviteId: string) {
    const rows = await this.prisma.$queryRaw<{ booking_id: string; status: string; invited_by: string }[]>`
      SELECT booking_id, status, invited_by FROM booking_helpers
       WHERE id = ${inviteId}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    const h = rows[0];
    if (!h) throw new ForbiddenException('Invite tidak ditemukan.');
    if (h.status !== 'invited') throw new BadRequestException('Invite sudah diputuskan.');

    await this.prisma.$executeRaw`
      UPDATE booking_helpers SET status = 'declined', decided_at = NOW()
       WHERE id = ${inviteId}::uuid AND cleaner_id = ${user.id}::uuid
    `;

    void this.push.send({
      userId: h.invited_by, channel: 'booking',
      title: 'Helper menolak invite',
      body: 'Cari cleaner lain untuk bantu job kamu.',
      data: { type: 'helper_declined', bookingId: h.booking_id },
    }).catch(() => {});

    return { ok: true };
  }

  // POST /cleaner/jobs/:id/mark-no-show — cleaner sudah di lokasi tapi customer gak ada.
  // Syarat: status='on_the_way' atau 'matched', waktu sekarang ≥ scheduled_at,
  // dan cleaner sudah tap "arrived" (cleaner_arrived_at != null).
  // Efek: charge customer full (no refund), close booking, escrow di-clear ke cleaner.
  @Post(':id/mark-no-show')
  async markNoShow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<{
      customer_id: string; status: string; scheduled_at: Date | null;
      cleaner_arrived_at: Date | null; total_amount: bigint | number; paid_at: Date | null;
    }[]>`
      SELECT customer_id, status, scheduled_at, cleaner_arrived_at, total_amount, paid_at
        FROM bookings WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new ForbiddenException('Bukan job kamu.');
    if (!['matched', 'on_the_way', 'cleaner_otw'].includes(b.status)) {
      throw new BadRequestException('Hanya bisa mark no-show kalau status on-the-way/matched.');
    }
    if (!b.cleaner_arrived_at) {
      throw new BadRequestException('Tap "Sampai di Lokasi" dulu sebelum mark no-show.');
    }
    if (!b.scheduled_at || Date.now() < new Date(b.scheduled_at).getTime()) {
      throw new BadRequestException('Belum waktu jadwal. Tunggu sampai jam booking.');
    }
    // Grace 15 menit setelah scheduled time + arrived.
    const minutesSinceArrived = (Date.now() - new Date(b.cleaner_arrived_at).getTime()) / 60_000;
    if (minutesSinceArrived < 15) {
      throw new BadRequestException('Tunggu minimal 15 menit setelah sampai lokasi sebelum mark no-show.');
    }

    const total = Number(b.total_amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE bookings
           SET status = 'canceled',
               canceled_at = NOW(),
               no_show_at = NOW(),
               cancellation_fee = ${total}::bigint,
               cancellation_reason = 'no_show'
         WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid
      `;

      // Cleaner dapat full payout sebagai kompensasi waktu (kalau ada paid_at, deduct platform fee).
      if (b.paid_at && total > 0) {
        // Pakai cleaner_payout kalau sudah ke-hitung, fallback ke 60% kalau gak ada.
        const payoutRow = await tx.$queryRaw<{ cleaner_payout: number | null }[]>`
          SELECT cleaner_payout FROM bookings WHERE id = ${id}::uuid LIMIT 1
        `;
        const payout = Number(payoutRow[0]?.cleaner_payout ?? 0) || Math.floor(total * 0.6);
        await tx.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${user.id}::uuid, 'earnings', ${payout}::bigint, 'no_show_comp', ${id}::uuid,
                  'CLEARED', NOW(), 'Kompensasi customer no-show (full payout)')
        `;
      }
    });

    void this.push.send({
      userId: b.customer_id, channel: 'booking',
      title: 'Pesanan ditandai no-show',
      body: 'Cleaner sudah sampai tapi kamu gak ada di lokasi. Pesanan ditutup, biaya penuh tetap berlaku.',
      data: { type: 'booking_no_show', bookingId: id },
    }).catch(() => {});

    return { ok: true, cancellationFee: total };
  }

  // ===== EXTENSION REQUESTS (cleaner-side) =====

  @Post(':id/accept-extension/:requestId')
  async acceptExtension(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ) {
    const rows = await this.prisma.$queryRaw<{
      id: string; customer_id: string; cleaner_id: string;
      hours_requested: number; price_per_hour: number; total_price: number; status: string;
    }[]>`
      SELECT id, customer_id, cleaner_id, hours_requested, price_per_hour, total_price, status
        FROM booking_extension_requests
       WHERE id = ${requestId}::uuid AND booking_id = ${id}::uuid LIMIT 1
    `;
    const req = rows[0];
    if (!req) throw new BadRequestException('Request perpanjangan tidak ditemukan');
    if (req.cleaner_id !== user.id) throw new ForbiddenException('Bukan job kamu');
    if (req.status !== 'pending') throw new BadRequestException('Request sudah diputuskan');

    const totalPrice = Number(req.total_price);

    // Cek saldo customer cukup
    const balRows = await this.prisma.$queryRaw<{ balance: number }[]>`
      SELECT (COALESCE(SUM(CASE WHEN account_type IN ('refund_credit','topup') AND status='CLEARED' THEN amount ELSE 0 END),0)
            - COALESCE(SUM(CASE WHEN account_type IN ('credit_use','withdrawal','admin_debit') AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END),0))::bigint AS balance
        FROM wallet_ledger_entries WHERE user_id = ${req.customer_id}::uuid
    `;
    const balance = Number(balRows[0]?.balance ?? 0);
    if (balance < totalPrice) {
      throw new BadRequestException(
        `Saldo wallet customer tidak cukup (Rp ${balance.toLocaleString('id-ID')}). Minta customer top-up dulu.`,
      );
    }

    // Hitung share cleaner
    const bookingRow = await this.prisma.$queryRaw<{ total_amount: number }[]>`
      SELECT total_amount FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const { cleanerShare, platformFee } = await this.computeCleanerShare(
      Number(bookingRow[0]?.total_amount ?? 0), user.id, totalPrice,
    );

    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE booking_extension_requests SET status = 'accepted', decided_at = NOW()
         WHERE id = ${requestId}::uuid
      `,
      this.prisma.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
        VALUES (${req.customer_id}::uuid, 'credit_use', ${totalPrice}::bigint, 'extension', ${requestId}::uuid,
                'CLEARED', NOW(), ${`Perpanjangan ${req.hours_requested} jam (booking ${id.slice(0, 8)})`})
      `,
      this.prisma.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
        VALUES (${user.id}::uuid, 'earnings', ${cleanerShare}::bigint, 'extension', ${requestId}::uuid,
                'CLEARED', NOW(), ${`Perpanjangan ${req.hours_requested} jam — share ${Math.round((cleanerShare / totalPrice) * 100)}%`})
      `,
      this.prisma.$executeRaw`
        UPDATE bookings
           SET total_amount = total_amount + ${totalPrice}::bigint,
               cleaner_payout = COALESCE(cleaner_payout, 0) + ${cleanerShare}::bigint
         WHERE id = ${id}::uuid
      `,
    ]);

    void this.push.send({
      userId: req.customer_id,
      channel: 'booking',
      title: 'Perpanjangan disetujui!',
      body: `Cleaner setuju lanjut ${req.hours_requested} jam. Rp ${totalPrice.toLocaleString('id-ID')} berhasil dibayar.`,
      data: { type: 'extension_accepted', bookingId: id, requestId },
      targetMode: 'customer',
    }).catch(() => {});

    return { ok: true, cleanerShare, platformFee };
  }

  @Post(':id/decline-extension/:requestId')
  async declineExtension(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ) {
    const rows = await this.prisma.$queryRaw<{ customer_id: string; cleaner_id: string; status: string }[]>`
      SELECT customer_id, cleaner_id, status FROM booking_extension_requests
       WHERE id = ${requestId}::uuid AND booking_id = ${id}::uuid LIMIT 1
    `;
    const req = rows[0];
    if (!req) throw new BadRequestException('Request tidak ditemukan');
    if (req.cleaner_id !== user.id) throw new ForbiddenException('Bukan job kamu');
    if (req.status !== 'pending') throw new BadRequestException('Request sudah diputuskan');

    await this.prisma.$executeRaw`
      UPDATE booking_extension_requests SET status = 'declined', decided_at = NOW()
       WHERE id = ${requestId}::uuid
    `;

    void this.push.send({
      userId: req.customer_id,
      channel: 'booking',
      title: 'Permintaan perpanjangan ditolak',
      body: 'Cleaner tidak bisa lanjut. Silakan selesaikan sesi saat ini.',
      data: { type: 'extension_declined', bookingId: id, requestId },
      targetMode: 'customer',
    }).catch(() => {});

    return { ok: true };
  }

  // POST /cleaner/jobs/:id/accept-reclean — cleaner setuju balik benerin.
  // Booking sudah di-flip ke status='in_progress' oleh request-reclean.
  // Tinggal mark reclean_status='accepted' + notif customer.
  @Post(':id/accept-reclean')
  async acceptReclean(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<{ customer_id: string; reclean_status: string | null }[]>`
      SELECT customer_id, reclean_status FROM bookings
       WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new ForbiddenException('Bukan job kamu.');
    if (b.reclean_status !== 'requested') throw new BadRequestException('Tidak ada permintaan re-clean aktif.');

    await this.prisma.$executeRaw`
      UPDATE bookings SET reclean_status = 'accepted'
       WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid
    `;
    void this.push.send({
      userId: b.customer_id,
      channel: 'booking',
      title: 'Cleaner menyetujui re-clean',
      body: 'Cleaner akan balik untuk benerin pekerjaan. Tunggu di lokasi.',
      data: { type: 'reclean_accepted', bookingId: id },
    }).catch(() => {});
    return { ok: true, recleanStatus: 'accepted' };
  }

  // POST /cleaner/jobs/:id/reject-reclean — cleaner tolak → otomatis create dispute formal.
  // Booking di-rollback ke completed, customer dipush untuk file dispute manual atau accept.
  @Post(':id/reject-reclean')
  async rejectReclean(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    const reason = (body?.reason ?? '').trim();
    if (reason.length < 10) throw new BadRequestException('Alasan tolak min 10 karakter.');

    const rows = await this.prisma.$queryRaw<{ customer_id: string; reclean_status: string | null; reclean_reason: string | null }[]>`
      SELECT customer_id, reclean_status, reclean_reason FROM bookings
       WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new ForbiddenException('Bukan job kamu.');
    if (b.reclean_status !== 'requested') throw new BadRequestException('Tidak ada permintaan re-clean aktif.');

    await this.prisma.$executeRaw`
      UPDATE bookings
         SET reclean_status = 'rejected',
             status = 'completed',
             completed_at = NOW()
       WHERE id = ${id}::uuid AND cleaner_id = ${user.id}::uuid
    `;

    // Auto-create dispute formal — escrow tetap tertahan sampai admin putusin.
    const description = `Re-clean ditolak cleaner.\nAlasan customer: ${b.reclean_reason ?? '-'}\nAlasan cleaner tolak: ${reason}`;
    const slaDueAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    const evidence: unknown[] = [];
    await this.prisma.$executeRaw`
      INSERT INTO disputes (booking_id, raised_by, subject_user_id, type, description, evidence, status, priority, sla_due_at)
      VALUES (
        ${id}::uuid, ${b.customer_id}::uuid, ${user.id}::uuid,
        'quality', ${description},
        ${JSON.stringify(evidence)}::jsonb, 'open', 'high',
        ${slaDueAt}::timestamptz
      )
    `;

    void this.push.send({
      userId: b.customer_id,
      channel: 'booking',
      title: 'Cleaner menolak re-clean',
      body: 'Permintaan re-clean ditolak. Tim admin akan review dan hubungi kamu.',
      data: { type: 'reclean_rejected', bookingId: id },
    }).catch(() => {});

    return { ok: true, recleanStatus: 'rejected', disputeCreated: true };
  }
}
