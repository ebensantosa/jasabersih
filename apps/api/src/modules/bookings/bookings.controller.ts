import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AbuseLimitsService } from '../../common/abuse-limits.service';
import { JobsGateway } from '../jobs/jobs.gateway';
import { PushService } from '../notifications/push.service';
import { StorageService } from '../storage/storage.service';
import { TravelFeeService } from './travel-fee.service';

const CreateBookingSchema = z.object({
  pricingMode: z.enum(['package', 'hourly', 'wa_survey']),
  serviceId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  hourlyTierId: z.string().uuid().optional(),
  hoursBooked: z.number().min(1).max(12).optional(),
  scheduledAt: z.string(),
  addressLine: z.string().min(5),
  lat: z.number().optional(),
  lng: z.number().optional(),
  customerNotes: z.string().max(500).optional(),
  baseAmount: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
  formSnapshot: z.record(z.unknown()).default({}),
  voucherCode: z.string().min(1).max(50).optional(),
});
type CreateBookingDto = z.infer<typeof CreateBookingSchema>;

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsGateway,
    private readonly travelFee: TravelFeeService,
    private readonly storage: StorageService,
    private readonly push: PushService,
    private readonly abuse: AbuseLimitsService,
  ) {}

  // Preview travel fee untuk lokasi tertentu (dipakai mobile saat checkout)
  // Presigned PUT untuk customer upload foto kondisi pre-job
  @Post('condition-photo-upload-url')
  async conditionPhotoUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { contentType: string },
  ) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(body?.contentType)) {
      throw new BadRequestException(`contentType harus: ${allowed.join(', ')}`);
    }
    const r = await this.storage.createUploadUrl({
      bucket: 'public',
      keyPrefix: `booking-conditions/${user.id}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
    return { ...r, publicUrl: this.storage.getPublicUrl(r.key) };
  }

  @Post('travel-quote')
  async travelQuote(@Body() body: { lat: number; lng: number }) {
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') {
      throw new BadRequestException('lat & lng wajib');
    }
    return this.travelFee.quote(body.lat, body.lng);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRawUnsafe(
      `SELECT b.id, b.status, b.pricing_mode AS "pricingMode", b.total_amount AS total,
              b.scheduled_at AS "scheduledAt", b.address_line AS address, b.created_at AS "createdAt",
              s.name AS "serviceName", s.icon_url AS "serviceIcon",
              pp.name AS "packageName", cl.name AS "cleanerName", cl.id AS "cleanerId",
              cl.photo_url AS "cleanerPhotoUrl"
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN pricing_packages pp ON pp.id = b.package_id
       LEFT JOIN users cl ON cl.id = b.cleaner_id
       WHERE b.customer_id = $1::uuid
       ORDER BY b.created_at DESC LIMIT 50`,
      user.id,
    );
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // Explicit columns — exclude `location` (PostGIS GEOGRAPHY tidak bisa
    // di-JSON-serialize → response 500). Pakai ST_X/ST_Y kalau perlu lat/lng.
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT b.id, b.status, b.pricing_mode, b.total_amount, b.base_amount,
              b.scheduled_at, b.address_line, b.customer_notes, b.form_snapshot,
              b.customer_id, b.cleaner_id, b.service_id, b.package_id,
              b.cleaner_payout, b.matched_at, b.paid_at, b.canceled_at,
              b.completed_at, b.created_at,
              b.reclean_count AS "recleanCount", b.reclean_status AS "recleanStatus",
              b.reclean_requested_at AS "recleanRequestedAt", b.reclean_reason AS "recleanReason",
              ST_X(b.location::geometry) AS lng, ST_Y(b.location::geometry) AS lat,
              s.name AS service_name, s.icon_url AS service_icon,
              cu.name AS customer_name, cu.phone AS customer_phone,
              cl.name AS cleaner_name, cl.phone AS cleaner_phone, cl.photo_url AS cleaner_photo_url
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN users cu ON cu.id = b.customer_id
         LEFT JOIN users cl ON cl.id = b.cleaner_id
        WHERE b.id = $1::uuid AND (b.customer_id = $2::uuid OR b.cleaner_id = $2::uuid)
        LIMIT 1`,
      id,
      user.id,
    );
    if (!rows[0]) throw new BadRequestException('Booking tidak ditemukan');
    const row = rows[0] as Record<string, unknown>;
    // Privacy: customer & cleaner gak boleh lihat nomor HP satu sama lain.
    // Semua komunikasi lewat in-app chat (Gojek-style). Admin tetap lihat keduanya.
    if (row.customer_id !== user.id) row.customer_phone = null;
    if (row.cleaner_id !== user.id) row.cleaner_phone = null;
    return row;
  }

  // Live searching stats — dipakai customer screen untuk render Gojek-style UI
  @Get(':id/search-status')
  async searchStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<{ status: string; created_at: Date; customer_id: string }[]>`
      SELECT status, created_at, customer_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new BadRequestException('Booking tidak ditemukan');
    if (b.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu');
    const elapsedSec = Math.floor((Date.now() - new Date(b.created_at).getTime()) / 1000);
    const TIMEOUT_SEC = 15 * 60;
    return {
      status: b.status,
      elapsedSec,
      timeoutSec: TIMEOUT_SEC,
      remainingSec: Math.max(0, TIMEOUT_SEC - elapsedSec),
      broadcastedTo: b.status === 'searching' ? this.jobs.getCleanerPoolSize() : 0,
      timedOut: b.status === 'searching' && elapsedSec >= TIMEOUT_SEC,
    };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateBookingSchema)) body: CreateBookingDto,
  ) {
    // Anti-abuse: max active booking limit dihapus permanently per request user.
    // Customer bebas buat berapa pun pesanan aktif simultan.
    // Hitung travel fee — kalau out-of-range, throw BadRequest (mobile arahkan ke WA)
    const lat = body.lat ?? -7.7956;
    const lng = body.lng ?? 110.3695;
    let travelFee = 0;
    let travelDistanceKm: number | null = null;
    try {
      const q = await this.travelFee.quote(lat, lng);
      travelFee = q.travelFee;
      travelDistanceKm = q.distanceKm;
    } catch (e: any) {
      // OUT_OF_RANGE → block (jarak terlalu jauh, harus WA)
      // NO_SERVICE_AREA → grace: allow booking dengan travel_fee = 0
      // (admin mungkin belum pin centroid, jangan blok customer)
      const code = (e?.response?.error?.code ?? e?.response?.code) as string | undefined;
      if (code === 'OUT_OF_RANGE') throw e;
      // NO_SERVICE_AREA atau error lain — booking lanjut, fee 0
      travelFee = 0;
      travelDistanceKm = null;
    }
    // Voucher — re-validate server-side, hitung discount, simpan ke voucher_usage
    let voucherDiscount = 0;
    let voucherId: string | null = null;
    if (body.voucherCode) {
      try {
        const code = body.voucherCode.trim().toUpperCase();
        const vRows = await this.prisma.$queryRaw<{ id: string; type: string; value: number; max_discount: number | null; min_order: number; valid_from: Date; valid_until: Date; total_quota: number | null; used_count: number; per_user_limit: number; is_active: boolean }[]>`
          SELECT id, type, value, max_discount, min_order, valid_from, valid_until, total_quota, used_count, per_user_limit, is_active
            FROM vouchers WHERE code = ${code} LIMIT 1
        `;
        const v = vRows[0];
        if (v && v.is_active) {
          const now = Date.now();
          const validTime = new Date(v.valid_from).getTime() <= now && new Date(v.valid_until).getTime() >= now;
          const validQuota = v.total_quota == null || Number(v.used_count) < Number(v.total_quota);
          const validMin = Number(body.totalAmount) >= Number(v.min_order);
          const usage = await this.prisma.$queryRaw<{ c: number }[]>`
            SELECT COUNT(*)::int AS c FROM voucher_usage WHERE voucher_id = ${v.id}::uuid AND user_id = ${user.id}::uuid
          `;
          const validPerUser = Number(usage[0]?.c ?? 0) < Number(v.per_user_limit ?? 1);

          // Phone-level check: cegah multi-akun pakai voucher yang sama.
          const phoneRow = await this.prisma.$queryRaw<{ phone: string | null }[]>`
            SELECT phone FROM users WHERE id = ${user.id}::uuid LIMIT 1
          `;
          const phone = phoneRow[0]?.phone ?? null;
          const phoneCnt = phone
            ? await this.prisma.$queryRaw<{ c: number }[]>`
                SELECT COUNT(*)::int AS c FROM voucher_usage_log
                 WHERE phone = ${phone} AND voucher_code = ${code}
              `
            : null;
          const phoneLimit = Math.max(Number(v.per_user_limit ?? 1), limits.voucherMaxUsesPerPhone);
          const validPerPhone = !phoneCnt || Number(phoneCnt[0]?.c ?? 0) < phoneLimit;
          if (validTime && validQuota && validMin && validPerUser && validPerPhone) {
            let d = v.type === 'percentage'
              ? Math.floor(Number(body.totalAmount) * (Number(v.value) / 100))
              : Number(v.value);
            if (v.max_discount && d > Number(v.max_discount)) d = Number(v.max_discount);
            if (d > Number(body.totalAmount)) d = Number(body.totalAmount);
            voucherDiscount = d;
            voucherId = v.id;
          }
        }
      } catch (e) {
        // Voucher invalid → silent ignore, booking lanjut tanpa diskon
      }
    }

    // Referral discount: hanya untuk first paid booking, kalau ada referral pending milik user.
    let referralDiscount = 0;
    const refRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM referrals
       WHERE referred_id = ${user.id}::uuid AND status = 'pending' LIMIT 1
    `;
    if (refRows.length > 0) {
      // Hanya kalau belum ada booking completed sebelumnya.
      const prev = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM bookings
         WHERE customer_id = ${user.id}::uuid AND status IN ('completed', 'in_progress', 'matched', 'on_the_way')
      `;
      if (Number(prev[0]?.c ?? 0) === 0) {
        const cfg = await this.prisma.$queryRaw<{ value: any }[]>`
          SELECT value FROM app_config WHERE key = 'referral.referred_discount_idr' LIMIT 1
        `;
        const v = cfg[0]?.value;
        const refDisc = (() => {
          if (v == null) return 25000;
          const n = Number(typeof v === 'string' ? v.replace(/"/g, '') : v);
          return Number.isFinite(n) && n > 0 ? n : 25000;
        })();
        referralDiscount = Math.min(refDisc, Number(body.totalAmount) - voucherDiscount);
      }
    }

    const totalWithTravel = Number(body.totalAmount) + travelFee - voucherDiscount - referralDiscount;

    // Server-side coverage gate: pastikan booking address dalam radius minimal 1 service_area aktif.
    // Pakai PostGIS ST_DWithin untuk performa (index gist). Skip kalau gak ada area sama sekali.
    const areaCount = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM service_areas WHERE is_active = true
    `;
    if (Number(areaCount[0]?.c ?? 0) > 0) {
      const covered = await this.prisma.$queryRaw<{ covered: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM service_areas
           WHERE is_active = true
             AND ST_DWithin(
               centroid,
               ST_SetSRID(ST_MakePoint(${lng}::float, ${lat}::float), 4326)::geography,
               radius_m
             )
        ) AS covered
      `;
      if (!covered[0]?.covered) {
        throw new BadRequestException('Lokasi booking di luar area layanan kami.');
      }
    }

    // Worker count dari form_snapshot — pre-validate (1-4, default 1).
    const wcRaw = (body.formSnapshot as any)?.workerCount ?? (body.formSnapshot as any)?.worker_count;
    const workerCount = Math.min(Math.max(Number(wcRaw) || 1, 1), 4);

    // Derive serviceId from packageId kalau gak dikirim eksplisit
    let derivedServiceId = body.serviceId ?? null;
    if (!derivedServiceId && body.packageId) {
      const pkgRow = await this.prisma.$queryRaw<{ serviceId: string }[]>`
        SELECT service_id AS "serviceId" FROM pricing_packages WHERE id = ${body.packageId}::uuid LIMIT 1
      `;
      derivedServiceId = pkgRow[0]?.serviceId ?? null;
    }

    const row = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO bookings (
        customer_id, service_id, pricing_mode, package_id, hourly_tier_id, hours_booked,
        status, form_snapshot, scheduled_at, address_line, location, customer_notes,
        base_amount, total_amount, travel_fee, travel_distance_km, worker_count
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6,
        'pending_payment', $7::jsonb, $8::timestamptz, $9,
        ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
        $12, $13, $14, $15, $16, $17
      )
      RETURNING id`,
      user.id,
      derivedServiceId,
      body.pricingMode,
      body.packageId ?? null,
      body.hourlyTierId ?? null,
      body.hoursBooked ?? null,
      JSON.stringify(body.formSnapshot),
      body.scheduledAt,
      body.addressLine,
      lng,
      lat,
      body.customerNotes ?? null,
      body.baseAmount,
      totalWithTravel,
      travelFee,
      travelDistanceKm,
      workerCount,
    );
    const bookingId = row[0]?.id;

    // Record voucher usage kalau voucher kepakai
    if (voucherId && bookingId && voucherDiscount > 0) {
      try {
        await this.prisma.$executeRaw`
          INSERT INTO voucher_usage (voucher_id, user_id, booking_id, discount_amount)
          VALUES (${voucherId}::uuid, ${user.id}::uuid, ${bookingId}::uuid, ${voucherDiscount})
        `;
        await this.prisma.$executeRaw`
          UPDATE vouchers SET used_count = used_count + 1 WHERE id = ${voucherId}::uuid
        `;
        // Log phone-level (anti multi-akun abuse).
        const phoneRow = await this.prisma.$queryRaw<{ phone: string | null }[]>`
          SELECT phone FROM users WHERE id = ${user.id}::uuid LIMIT 1
        `;
        if (phoneRow[0]?.phone) {
          await this.prisma.$executeRaw`
            INSERT INTO voucher_usage_log (voucher_code, user_id, phone, booking_id)
            VALUES (${body.voucherCode!.trim().toUpperCase()}, ${user.id}::uuid, ${phoneRow[0].phone}, ${bookingId}::uuid)
          `;
        }
      } catch { /* race condition possible — ignore */ }
    }

    // Tag booking dengan referral_id (kalau dipake), supaya bisa di-trace saat completion.
    if (referralDiscount > 0 && bookingId) {
      await this.prisma.$executeRaw`
        UPDATE referrals SET first_booking_id = ${bookingId}::uuid
         WHERE referred_id = ${user.id}::uuid AND status = 'pending'
      `;
    }

    return { id: bookingId, travelFee, travelDistanceKm, voucherDiscount, referralDiscount, totalAmount: totalWithTravel };
  }

  @Post(':id/pay')
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body?: { useCredit?: boolean },
  ) {
    const bk = await this.prisma.$queryRawUnsafe<{ total_amount: number; status: string }[]>(
      `SELECT total_amount, status FROM bookings WHERE id = $1::uuid AND customer_id = $2::uuid LIMIT 1`,
      id, user.id,
    );
    if (!bk[0]) throw new BadRequestException('Booking tidak ditemukan');
    if (bk[0].status !== 'pending_payment') throw new BadRequestException('Booking tidak dalam status pending_payment');

    if (body?.useCredit) {
      const bal = await this.prisma.$queryRawUnsafe<{ b: number }[]>(
        `SELECT COALESCE(SUM(CASE WHEN account_type IN ('refund_credit','topup') AND status='CLEARED' THEN amount ELSE 0 END),0)
              - COALESCE(SUM(CASE WHEN account_type IN ('credit_use','withdrawal') AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END),0) AS b
           FROM wallet_ledger_entries WHERE user_id = $1::uuid`,
        user.id,
      );
      const balance = Number(bal[0]?.b ?? 0);
      const use = Math.min(balance, Number(bk[0].total_amount));
      if (use > 0) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
           VALUES ($1::uuid, 'credit_use', $2, 'booking', $3::uuid, 'CLEARED', NOW(), $4)`,
          user.id, use, id, `Pakai saldo untuk booking ${id.slice(0, 8)}`,
        );
      }
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE bookings SET status = 'searching', paid_at = NOW()
       WHERE id = $1::uuid AND customer_id = $2::uuid AND status = 'pending_payment'`,
      id, user.id,
    );
    void this.jobs.broadcastIncomingJob(id).catch(() => {});
    return { ok: true };
  }

  // Customer konfirmasi terima — skip cooling-off 24h, langsung release escrow ke cleaner
  @Post(':id/confirm')
  async confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ status: string; customer_id: string }[]>(
      `SELECT status, customer_id FROM bookings WHERE id = $1::uuid LIMIT 1`, id,
    );
    if (rows.length === 0) throw new BadRequestException('Booking tidak ditemukan');
    if (rows[0]!.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu');
    if (rows[0]!.status !== 'completed') throw new BadRequestException('Booking harus berstatus completed dulu');

    // Release semua earnings escrow untuk booking ini
    await this.prisma.$executeRawUnsafe(
      `UPDATE wallet_ledger_entries
          SET status = 'CLEARED', cleared_at = NOW()
        WHERE reference_type = 'booking' AND reference_id = $1::uuid
          AND status = 'PENDING' AND account_type = 'earnings'`,
      id,
    );
    return { ok: true };
  }

  // ============ UPCHARGE customer-side ============
  @Get(':id/upcharges')
  async listUpcharges(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const owns = await this.prisma.$queryRaw<{ customer_id: string }[]>`
      SELECT customer_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    if (!owns[0] || owns[0].customer_id !== user.id) throw new BadRequestException('Bukan booking kamu');
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, amount, reason, photo_url AS "photoUrl", status,
             created_at AS "createdAt", decided_at AS "decidedAt"
        FROM booking_upcharges
       WHERE booking_id = ${id}::uuid
       ORDER BY created_at DESC
    `;
  }

  @Post(':id/upcharges/:upchargeId/approve')
  async approveUpcharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('upchargeId') upchargeId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; amount: number; status: string; cleaner_id: string; booking_customer_id: string }[]>`
        SELECT u.id, u.amount, u.status, u.cleaner_id, b.customer_id AS booking_customer_id
          FROM booking_upcharges u
          JOIN bookings b ON b.id = u.booking_id
         WHERE u.id = ${upchargeId}::uuid AND u.booking_id = ${id}::uuid
         LIMIT 1
      `;
      const u = rows[0];
      if (!u) throw new BadRequestException('Upcharge tidak ditemukan');
      if (u.booking_customer_id !== user.id) throw new BadRequestException('Bukan booking kamu');
      if (u.status !== 'pending') throw new BadRequestException('Upcharge sudah diputuskan');

      // Hitung commission split sesuai tier (ambil current total_amount sebelum upcharge)
      const bookingRow = await tx.$queryRaw<{ total_amount: number }[]>`
        SELECT total_amount FROM bookings WHERE id = ${id}::uuid LIMIT 1
      `;
      const currentTotal = Number(bookingRow[0]?.total_amount ?? 0);
      const profRow = await tx.$queryRaw<{ brings_tools: boolean }[]>`
        SELECT brings_tools FROM cleaner_profiles WHERE user_id = ${u.cleaner_id}::uuid LIMIT 1
      `;
      const bringsTools = !!profRow[0]?.brings_tools;
      const tiersRow = await tx.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
        SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
      `;
      const tier = tiersRow.find((t) => currentTotal >= Number(t.range_min ?? 0) && (t.range_max == null || currentTotal <= Number(t.range_max)));
      const pct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
      const cleanerShare = Math.round(Number(u.amount) * pct / 100);
      const platformFee = Number(u.amount) - cleanerShare;

      await tx.$executeRaw`
        UPDATE booking_upcharges
           SET status = 'approved', decided_at = NOW(), decided_by_user_id = ${user.id}::uuid
         WHERE id = ${upchargeId}::uuid
      `;
      // Tambah ke booking total + cleaner_payout (share only) + platform_fee
      await tx.$executeRaw`
        UPDATE bookings
           SET total_amount = total_amount + ${Number(u.amount)},
               cleaner_payout = COALESCE(cleaner_payout, 0) + ${cleanerShare},
               platform_fee = COALESCE(platform_fee, 0) + ${platformFee}
         WHERE id = ${id}::uuid
      `;
      // Insert earning cleaner (share saja, PENDING — escrow 24h)
      await tx.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
        VALUES (${u.cleaner_id}::uuid, 'earnings', ${cleanerShare}, 'booking', ${id}::uuid, 'PENDING', ${`Upcharge approved — share ${pct}% dari Rp ${Number(u.amount).toLocaleString('id-ID')}`})
      `;
      return { ok: true, cleanerShare, platformFee, pct };
    });
  }

  @Post(':id/upcharges/:upchargeId/reject')
  async rejectUpcharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('upchargeId') upchargeId: string,
  ) {
    const rows = await this.prisma.$queryRaw<{ status: string; customer_id: string }[]>`
      SELECT u.status, b.customer_id
        FROM booking_upcharges u JOIN bookings b ON b.id = u.booking_id
       WHERE u.id = ${upchargeId}::uuid AND u.booking_id = ${id}::uuid LIMIT 1
    `;
    if (!rows[0]) throw new BadRequestException('Upcharge tidak ditemukan');
    if (rows[0].customer_id !== user.id) throw new BadRequestException('Bukan booking kamu');
    if (rows[0].status !== 'pending') throw new BadRequestException('Upcharge sudah diputuskan');
    await this.prisma.$executeRaw`
      UPDATE booking_upcharges
         SET status = 'rejected', decided_at = NOW(), decided_by_user_id = ${user.id}::uuid
       WHERE id = ${upchargeId}::uuid
    `;
    return { ok: true };
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const rows = await this.prisma.$queryRawUnsafe<{
      status: string; paid_at: Date | null; scheduled_at: Date | null;
      total_amount: bigint | number; voucher_id: string | null; cleaner_id: string | null;
    }[]>(
      `SELECT b.status, b.paid_at, b.scheduled_at, b.total_amount, b.cleaner_id,
              (SELECT voucher_id FROM voucher_usage WHERE booking_id = b.id LIMIT 1) AS voucher_id
         FROM bookings b WHERE b.id = $1::uuid AND b.customer_id = $2::uuid LIMIT 1`,
      id, user.id,
    );
    if (rows.length === 0) throw new BadRequestException('Pesanan tidak ditemukan');
    const b = rows[0]!;
    if (b.status === 'canceled') throw new BadRequestException('Pesanan sudah dibatalkan');
    if (b.status === 'completed') throw new BadRequestException('Pesanan sudah selesai, tidak bisa dibatalkan');
    if (b.status === 'in_progress' || b.status === 'started') {
      throw new BadRequestException('Pekerjaan sudah berlangsung — gunakan dispute kalau ada masalah.');
    }

    // Read cancellation policy dari app_config
    const cfgRows = await this.prisma.$queryRaw<{ key: string; value: any }[]>`
      SELECT key, value FROM app_config WHERE key IN ('cancel.free_window_hours', 'cancel.late_fee_percent')
    `;
    const cfg = new Map(cfgRows.map((r) => [r.key, r.value]));
    const num = (k: string, d: number) => {
      const v = cfg.get(k);
      if (v == null) return d;
      const n = Number(typeof v === 'string' ? v.replace(/"/g, '') : v);
      return Number.isFinite(n) ? n : d;
    };
    const freeWindowH = num('cancel.free_window_hours', 6);
    const latePct = num('cancel.late_fee_percent', 25);

    let cancellationFee = 0;
    let refundAmount = 0;
    const total = Number(b.total_amount);

    if (b.paid_at) {
      // Sudah bayar → hitung fee berdasarkan window
      const hoursToSchedule = b.scheduled_at
        ? (new Date(b.scheduled_at).getTime() - Date.now()) / 3600_000
        : 999; // kalau gak ada jadwal, treat sebagai jauh
      if (hoursToSchedule >= freeWindowH) {
        cancellationFee = 0;
        refundAmount = total;
      } else {
        cancellationFee = Math.floor((total * latePct) / 100);
        refundAmount = total - cancellationFee;
      }

      // Refund ke wallet customer (kalau ada refund)
      if (refundAmount > 0) {
        await this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${user.id}::uuid, 'refund', ${refundAmount}::bigint, 'booking_cancel', ${id}::uuid,
                  'CLEARED', NOW(), ${`Refund pembatalan (${hoursToSchedule >= freeWindowH ? '100%' : `${100 - latePct}%`})`})
        `;
      }

      // Kompensasi cleaner kalau cancel telat & sudah di-assign — separuh dari fee.
      if (cancellationFee > 0 && b.cleaner_id) {
        const cleanerComp = Math.floor(cancellationFee / 2);
        await this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${b.cleaner_id}::uuid, 'earnings', ${cleanerComp}::bigint, 'cancel_comp', ${id}::uuid,
                  'CLEARED', NOW(), 'Kompensasi customer cancel telat')
        `;
        void this.push.send({
          userId: b.cleaner_id, channel: 'booking',
          title: 'Customer batalkan job',
          body: `Job di-cancel customer. Kompensasi Rp ${cleanerComp.toLocaleString('id-ID')} masuk saldo kamu.`,
          data: { type: 'booking_canceled', bookingId: id },
        }).catch(() => {});
      }
    }
    // Belum bayar = free cancel, gak ada refund flow.

    // Rollback voucher counter & usage log (kalau ada)
    if (b.voucher_id) {
      await this.prisma.$executeRaw`
        UPDATE vouchers SET used_count = GREATEST(used_count - 1, 0) WHERE id = ${b.voucher_id}::uuid
      `;
      await this.prisma.$executeRaw`
        DELETE FROM voucher_usage WHERE booking_id = ${id}::uuid
      `;
      await this.prisma.$executeRaw`
        DELETE FROM voucher_usage_log WHERE booking_id = ${id}::uuid
      `;
    }

    await this.prisma.$executeRaw`
      UPDATE bookings
         SET status = 'canceled', canceled_at = NOW(),
             cancellation_fee = ${cancellationFee}::bigint,
             cancellation_reason = ${body?.reason ?? null}
       WHERE id = ${id}::uuid AND customer_id = ${user.id}::uuid
    `;

    return { ok: true, cancellationFee, refundAmount };
  }

  // POST /bookings/:id/request-reclean — customer minta cleaner balik benerin.
  // Hanya boleh dalam 24 jam setelah completed, max 1x per booking, dan belum ada dispute aktif.
  // Side effect: hapus PENDING wallet entry cleaner (escrow reset), notif cleaner.
  @Post(':id/request-reclean')
  async requestReclean(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    const reason = (body?.reason ?? '').trim();
    if (reason.length < 10) throw new BadRequestException('Alasan min 10 karakter.');

    const rows = await this.prisma.$queryRaw<{ customer_id: string; cleaner_id: string | null; status: string; completed_at: Date | null; reclean_count: number }[]>`
      SELECT customer_id, cleaner_id, status, completed_at, reclean_count
        FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new BadRequestException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu.');
    if (b.status !== 'completed') throw new BadRequestException('Hanya bisa minta re-clean setelah cleaner tandai selesai.');
    if (!b.cleaner_id) throw new BadRequestException('Cleaner belum di-assign.');
    if (b.reclean_count >= 1) throw new BadRequestException('Re-clean sudah pernah diminta. Silakan ajukan dispute.');
    if (!b.completed_at || Date.now() - new Date(b.completed_at).getTime() > 24 * 3600_000) {
      throw new BadRequestException('Lewat 24 jam dari selesai. Silakan ajukan dispute.');
    }

    const disputeRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM disputes WHERE booking_id = ${id}::uuid AND status IN ('open', 'in_progress', 'escalated') LIMIT 1
    `;
    if (disputeRows.length > 0) throw new BadRequestException('Ada dispute aktif untuk booking ini.');

    await this.prisma.$executeRaw`
      UPDATE bookings
         SET reclean_count = reclean_count + 1,
             reclean_requested_at = NOW(),
             reclean_reason = ${reason},
             reclean_status = 'requested',
             status = 'in_progress',
             completed_at = NULL
       WHERE id = ${id}::uuid AND customer_id = ${user.id}::uuid
    `;

    // Reset escrow: hapus PENDING entry earnings cleaner. Akan dibuat ulang pas cleaner complete lagi.
    await this.prisma.$executeRaw`
      DELETE FROM wallet_ledger_entries
       WHERE reference_id = ${id}::uuid
         AND status = 'PENDING'
         AND account_type = 'earnings'
         AND user_id = ${b.cleaner_id}::uuid
    `;

    void this.push.send({
      userId: b.cleaner_id,
      channel: 'booking',
      title: 'Customer minta re-clean',
      body: `Customer minta kamu balik benerin. Alasan: ${reason.slice(0, 80)}${reason.length > 80 ? '…' : ''}`,
      data: { type: 'reclean_requested', bookingId: id },
    }).catch(() => {});

    return { ok: true, recleanStatus: 'requested' };
  }
}
