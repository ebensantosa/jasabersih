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
    // Subscription: hide individual child visits dari list utama, customer cuma liat parent.
    // Parent subscription tampil dgn aggregate info (X dari N visit selesai).
    return this.prisma.$queryRawUnsafe(
      `SELECT b.id, b.status, b.pricing_mode AS "pricingMode", b.total_amount AS total,
              b.scheduled_at AS "scheduledAt", b.address_line AS address, b.created_at AS "createdAt",
              s.name AS "serviceName", s.icon_url AS "serviceIcon",
              pp.name AS "packageName", cl.name AS "cleanerName", cl.id AS "cleanerId",
              cl.photo_url AS "cleanerPhotoUrl",
              b.subscription_total_visits AS "subscriptionTotalVisits",
              (SELECT COUNT(*)::int FROM bookings c WHERE c.parent_booking_id = b.id AND c.status = 'completed') AS "subscriptionCompletedVisits"
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN pricing_packages pp ON pp.id = b.package_id
       LEFT JOIN users cl ON cl.id = b.cleaner_id
       WHERE b.customer_id = $1::uuid
         AND b.parent_booking_id IS NULL  -- hide child visits, cuma list parent + non-subscription
       ORDER BY b.created_at DESC LIMIT 50`,
      user.id,
    );
  }

  // GET /bookings/:id/subscription-visits — list semua child visits dari parent subscription
  @Get(':id/subscription-visits')
  async subscriptionVisits(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const owns = await this.prisma.$queryRaw<{ customer_id: string }[]>`
      SELECT customer_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    if (!owns[0] || owns[0].customer_id !== user.id) {
      throw new BadRequestException('Bukan booking kamu');
    }
    return this.prisma.$queryRawUnsafe(
      `SELECT b.id, b.status, b.scheduled_at AS "scheduledAt",
              b.subscription_visit_index AS "visitIndex",
              b.subscription_total_visits AS "visitTotal",
              b.cleaner_id AS "cleanerId",
              cl.name AS "cleanerName", cl.photo_url AS "cleanerPhotoUrl",
              b.completed_at AS "completedAt", b.matched_at AS "matchedAt"
       FROM bookings b
       LEFT JOIN users cl ON cl.id = b.cleaner_id
       WHERE b.parent_booking_id = $1::uuid
       ORDER BY b.subscription_visit_index ASC`,
      id,
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
              b.started_at AS "startedAt",
              b.completed_at, b.created_at,
              b.hourly_tier_id AS "hourlyTierId", b.hours_booked AS "hoursBooked",
              ht.name AS "hourlyTierName", ht.price_per_hour AS "hourlyPricePerHour",
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
         LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
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
    // Tapi limits config tetap di-load untuk voucherMaxUsesPerPhone di bawah.
    const limits = await this.abuse.get();
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
        // Atomic quota guard: increment HANYA kalau still di bawah quota.
        // Kalau race bikin used_count >= total_quota di antara check awal & sini, UPDATE return 0 rows.
        const inc = await this.prisma.$executeRaw`
          UPDATE vouchers SET used_count = used_count + 1
           WHERE id = ${voucherId}::uuid
             AND (total_quota IS NULL OR used_count < total_quota)
        `;
        if (Number(inc) === 0) {
          throw new BadRequestException({ code: 'VOUCHER_QUOTA_EXHAUSTED', message: 'Quota voucher sudah habis (race condition).' });
        }
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
              - COALESCE(SUM(CASE WHEN account_type IN ('credit_use','withdrawal','admin_debit') AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END),0) AS b
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

    // Materialize subscription children. Return true kalau memang subscription.
    const materialized = await this.materializeSubscriptionChildren(id, user.id);
    if (materialized) {
      // Parent subscription → set ke status special 'subscription_parent' (gak di-broadcast),
      // cleaner cuma dapat offer dari child bookings (visit 1 langsung, visit 2+ via cron H-1).
      await this.prisma.$executeRawUnsafe(
        `UPDATE bookings SET status = 'subscription_parent' WHERE id = $1::uuid`,
        id,
      );
      // Broadcast cuma untuk child visit pertama (yg statusnya 'searching')
      const firstChild = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM bookings
         WHERE parent_booking_id = ${id}::uuid AND status = 'searching'
         ORDER BY subscription_visit_index ASC LIMIT 1
      `;
      if (firstChild[0]) void this.jobs.broadcastIncomingJob(firstChild[0].id).catch(() => {});
    } else {
      void this.jobs.broadcastIncomingJob(id).catch(() => {});
    }
    return { ok: true };
  }

  // Untuk subscription: parent booking yg baru paid → bikin N child booking (1 per visit).
  // Visit pertama langsung 'searching', visit 2-N 'scheduled_future' (cron akan wake up h-1).
  // Return true kalau memang subscription dan child berhasil dibikin.
  private async materializeSubscriptionChildren(parentId: string, customerId: string): Promise<boolean> {
    const parent = await this.prisma.$queryRaw<{
      service_id: string | null;
      package_id: string | null;
      pricing_mode: string;
      form_snapshot: any;
      address_line: string;
      location: any;
      customer_notes: string | null;
      total_amount: bigint;
      base_amount: bigint;
      voucher_id: string | null;
      voucher_discount: bigint;
    }[]>`
      SELECT service_id, package_id, pricing_mode, form_snapshot,
             address_line, location, customer_notes,
             total_amount, base_amount, voucher_id, voucher_discount
        FROM bookings WHERE id = ${parentId}::uuid LIMIT 1
    `;
    if (parent.length === 0) return false;
    const p = parent[0]!;
    const dates: string[] | undefined = p.form_snapshot?.subscriptionDates;
    if (!Array.isArray(dates) || dates.length === 0) return false;

    // Cek service code = 'subscription'. Kalau bukan subscription, skip.
    const svc = await this.prisma.$queryRaw<{ code: string }[]>`
      SELECT code FROM services WHERE id = ${p.service_id}::uuid LIMIT 1
    `;
    if (svc[0]?.code !== 'subscription') return false;

    const sortedDates = [...dates].sort();
    const totalVisits = sortedDates.length;
    // Distribute total amount evenly per visit (rounding handled by floor + remainder ke visit pertama)
    const totalAmount = Number(p.total_amount);
    const baseAmount = Number(p.base_amount);
    const perVisitTotal = Math.floor(totalAmount / totalVisits);
    const perVisitBase = Math.floor(baseAmount / totalVisits);
    const remainderTotal = totalAmount - perVisitTotal * totalVisits;
    const remainderBase = baseAmount - perVisitBase * totalVisits;

    // Bikin child bookings: visit-1 status='searching' (langsung broadcast), visit 2+ 'scheduled_future'
    for (let i = 0; i < totalVisits; i++) {
      const dateIso = sortedDates[i]!;
      const visitIndex = i + 1;
      // Default scheduled time = 09:00 di tanggal visit. Customer bisa request reschedule per visit.
      const scheduledAt = `${dateIso}T09:00:00.000Z`;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const visitDate = new Date(dateIso); visitDate.setHours(0, 0, 0, 0);
      const isFirst = i === 0;
      const isToday = visitDate.getTime() === today.getTime();
      const isFutureVisit = visitDate.getTime() > today.getTime();
      const initialStatus = (isFirst || isToday) ? 'searching' : (isFutureVisit ? 'scheduled_future' : 'searching');
      const childTotalAmt = perVisitTotal + (isFirst ? remainderTotal : 0);
      const childBaseAmt = perVisitBase + (isFirst ? remainderBase : 0);
      const childFormSnapshot = {
        ...(p.form_snapshot ?? {}),
        // Override: child gak punya array subscriptionDates (hindari nested rendering)
        subscriptionDates: undefined,
        // Tag visit info
        subscriptionVisitOf: visitIndex,
        subscriptionVisitTotal: totalVisits,
        parentBookingId: parentId,
      };

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO bookings (
          customer_id, service_id, package_id, pricing_mode, status, form_snapshot,
          scheduled_at, address_line, location, customer_notes,
          base_amount, total_amount, voucher_id, voucher_discount,
          parent_booking_id, subscription_visit_index, subscription_total_visits,
          paid_at
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb,
          $7::timestamptz, $8, $9, $10,
          $11::bigint, $12::bigint, $13::uuid, $14::bigint,
          $15::uuid, $16::int, $17::int,
          NOW()
        )`,
        customerId,
        p.service_id,
        p.package_id,
        p.pricing_mode,
        initialStatus,
        JSON.stringify(childFormSnapshot),
        scheduledAt,
        p.address_line,
        p.location,
        p.customer_notes,
        childBaseAmt,
        childTotalAmt,
        p.voucher_id,
        Number(p.voucher_discount),
        parentId,
        visitIndex,
        totalVisits,
      );
    }
    return true;
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

      // Cek saldo customer wallet — kalau cukup, auto-deduct. Kalau kurang,
      // tolak approval & arahkan customer ke payment gateway via /payment/[bookingId].
      const balRows = await tx.$queryRaw<{ balance: number }[]>`
        SELECT
          (COALESCE(SUM(CASE WHEN account_type IN ('refund_credit', 'topup') AND status = 'CLEARED' THEN amount ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN account_type IN ('credit_use', 'withdrawal', 'admin_debit') AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0))::bigint AS balance
        FROM wallet_ledger_entries WHERE user_id = ${user.id}::uuid
      `;
      const walletBalance = Number(balRows[0]?.balance ?? 0);
      const upchargeAmount = Number(u.amount);
      if (walletBalance < upchargeAmount) {
        throw new BadRequestException(`Saldo wallet tidak cukup (Rp ${walletBalance.toLocaleString('id-ID')}). Kekurangan: Rp ${(upchargeAmount - walletBalance).toLocaleString('id-ID')}. Topup wallet dulu atau bayar langsung via Tagihan Tambahan di halaman pesanan.`);
      }
      // Deduct dari wallet customer (credit_use). PENDING utk konsisten - akan
      // jadi CLEARED bareng wallet ledger lain via cron.
      await tx.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
        VALUES (${user.id}::uuid, 'credit_use', ${upchargeAmount}, 'upcharge', ${upchargeId}::uuid, 'PENDING', ${`Pembayaran tagihan tambahan booking #${id.slice(0, 8)}`})
      `;
      await tx.$executeRaw`
        UPDATE booking_upcharges
           SET status = 'approved', decided_at = NOW(), decided_by_user_id = ${user.id}::uuid
         WHERE id = ${upchargeId}::uuid
      `;
      // Tambah ke booking total + cleaner_payout (share only) + platform_fee
      await tx.$executeRaw`
        UPDATE bookings
           SET total_amount = total_amount + ${upchargeAmount},
               cleaner_payout = COALESCE(cleaner_payout, 0) + ${cleanerShare},
               platform_fee = COALESCE(platform_fee, 0) + ${platformFee}
         WHERE id = ${id}::uuid
      `;
      // Insert earning cleaner (share saja, PENDING — escrow 24h)
      await tx.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
        VALUES (${u.cleaner_id}::uuid, 'earnings', ${cleanerShare}, 'booking', ${id}::uuid, 'PENDING', ${`Upcharge approved — share ${pct}% dari Rp ${upchargeAmount.toLocaleString('id-ID')}`})
      `;
      return { ok: true, cleanerShare, platformFee, pct, walletDeducted: upchargeAmount, walletRemaining: walletBalance - upchargeAmount };
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

  // POST /bookings/:id/reschedule — customer pindah jadwal sendiri.
  // Rule: max 1x self-service, h-2 (>=48 jam sebelum scheduled_at), status belum in_progress/completed/canceled.
  // Reschedule berikutnya / kurang dari 48h harus lewat CS.
  @Post(':id/reschedule')
  async reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { scheduledAt: string },
  ) {
    if (!body?.scheduledAt) throw new BadRequestException('scheduledAt wajib');
    const newDate = new Date(body.scheduledAt);
    if (Number.isNaN(newDate.getTime())) throw new BadRequestException('Format tanggal tidak valid');

    const rows = await this.prisma.$queryRaw<{
      status: string; scheduled_at: Date | null; reschedule_count: number; cleaner_id: string | null;
    }[]>`
      SELECT status, scheduled_at, COALESCE(reschedule_count, 0)::int AS reschedule_count, cleaner_id
        FROM bookings WHERE id = ${id}::uuid AND customer_id = ${user.id}::uuid LIMIT 1
    `;
    if (rows.length === 0) throw new BadRequestException('Pesanan tidak ditemukan');
    const b = rows[0]!;

    if (['canceled', 'completed', 'in_progress', 'started'].includes(b.status)) {
      throw new BadRequestException('Status pesanan tidak bisa di-reschedule. Hubungi CS kalau perlu bantuan.');
    }
    if (b.reschedule_count >= 1) {
      throw new BadRequestException('Pesanan ini sudah pernah dipindah jadwal. Hubungi CS lewat WA untuk perubahan tambahan.');
    }
    if (!b.scheduled_at) throw new BadRequestException('Jadwal awal belum di-set');

    const hoursUntilOld = (new Date(b.scheduled_at).getTime() - Date.now()) / 3_600_000;
    if (hoursUntilOld < 48) {
      throw new BadRequestException('Reschedule mandiri cuma bisa kalau jadwal masih lebih dari 2 hari (48 jam) lagi. Hubungi CS untuk perubahan mendesak.');
    }

    const minNewTime = Date.now() + 24 * 3_600_000; // jadwal baru minimal 24 jam dari sekarang
    if (newDate.getTime() < minNewTime) {
      throw new BadRequestException('Jadwal baru minimal 24 jam dari sekarang.');
    }
    const hour = newDate.getHours();
    if (hour < 7 || hour > 20) {
      throw new BadRequestException('Jadwal baru di luar jam operasional (07:00-20:00)');
    }

    await this.prisma.$executeRaw`
      UPDATE bookings
         SET scheduled_at = ${newDate}::timestamptz,
             reschedule_count = COALESCE(reschedule_count, 0) + 1,
             updated_at = NOW()
       WHERE id = ${id}::uuid AND customer_id = ${user.id}::uuid
    `;

    // Notif cleaner kalau sudah ada yang di-assign
    if (b.cleaner_id) {
      try {
        await this.push.send({
          userId: b.cleaner_id,
          title: 'Jadwal Berubah',
          body: `Customer pindah jadwal ke ${newDate.toLocaleString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}. Cek detail di app.`,
          data: { type: 'booking.rescheduled', bookingId: id },
          channel: 'booking',
        });
      } catch { /* non-fatal */ }
    }

    return { ok: true, scheduledAt: newDate.toISOString() };
  }

  // POST /bookings/:id/tip — customer kasih tip cleaner pasca-completion via SALDO WALLET.
  // Instant transfer: ledger entry credit_use customer + tip_received cleaner (CLEARED, langsung cair).
  // Catatan: tip via payment gateway (kalau saldo tidak cukup) belum diimplementasi - sementara error message arahin ke top-up wallet.
  @Post(':id/tip')
  async tipCleaner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { amount: number },
  ) {
    const amount = Math.floor(Number(body?.amount ?? 0));
    if (!Number.isFinite(amount) || amount < 5000) {
      throw new BadRequestException('Minimal tip Rp 5.000');
    }
    if (amount > 500_000) {
      throw new BadRequestException('Maksimal tip Rp 500.000');
    }

    const rows = await this.prisma.$queryRaw<{ status: string; cleaner_id: string | null; tip_given: bigint | null }[]>`
      SELECT b.status, b.cleaner_id,
             (SELECT COALESCE(SUM(amount), 0) FROM wallet_ledger_entries
                WHERE user_id = ${user.id}::uuid
                  AND account_type = 'credit_use'
                  AND reference_type = 'tip'
                  AND reference_id = b.id) AS tip_given
        FROM bookings b
       WHERE b.id = ${id}::uuid AND b.customer_id = ${user.id}::uuid LIMIT 1
    `;
    if (rows.length === 0) throw new BadRequestException('Pesanan tidak ditemukan');
    const b = rows[0]!;
    if (b.status !== 'completed') {
      throw new BadRequestException('Tip hanya bisa diberikan setelah pesanan selesai.');
    }
    if (!b.cleaner_id) throw new BadRequestException('Cleaner pesanan ini tidak ditemukan.');
    if (Number(b.tip_given) > 0) {
      throw new BadRequestException('Tip sudah pernah diberikan untuk pesanan ini.');
    }

    // Hitung saldo customer
    const bal = await this.prisma.$queryRaw<{ b: number }[]>`
      SELECT (COALESCE(SUM(CASE WHEN account_type IN ('refund_credit','topup') AND status='CLEARED' THEN amount ELSE 0 END),0)
            - COALESCE(SUM(CASE WHEN account_type IN ('credit_use','withdrawal','admin_debit') AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END),0))::bigint AS b
        FROM wallet_ledger_entries WHERE user_id = ${user.id}::uuid
    `;
    const balance = Number(bal[0]?.b ?? 0);
    if (balance < amount) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_BALANCE',
        message: `Saldo wallet Rp ${balance.toLocaleString('id-ID')} tidak cukup untuk tip Rp ${amount.toLocaleString('id-ID')}. Top-up wallet dulu.`,
        currentBalance: balance,
        needed: amount,
      });
    }

    // Atomik: insert tip_dedup (PK customer+booking) → kalau race, second akan kena unique violation.
    // Lalu debit customer + credit cleaner di transaction yg sama.
    try {
      await this.prisma.$transaction([
        this.prisma.$executeRaw`
          INSERT INTO tip_dedup (customer_id, booking_id, amount)
          VALUES (${user.id}::uuid, ${id}::uuid, ${amount}::bigint)
        `,
        this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${user.id}::uuid, 'credit_use', ${amount}::bigint, 'tip', ${id}::uuid,
                  'CLEARED', NOW(), ${`Tip cleaner (booking ${id.slice(0, 8)})`})
        `,
        // Pakai account_type 'earnings' supaya saldo cleaner langsung available (sama mekanisme job earnings).
        // Description prefix 🎁 untuk pembeda visual di ledger.
        this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${b.cleaner_id}::uuid, 'earnings', ${amount}::bigint, 'tip', ${id}::uuid,
                  'CLEARED', NOW(), ${`🎁 Tip dari customer (booking ${id.slice(0, 8)})`})
        `,
      ]);
    } catch (e: any) {
      // Unique violation di tip_dedup = double-tap. Treat sebagai already-paid.
      if (String(e?.message ?? '').includes('tip_dedup_pkey') || String(e?.code ?? '') === '23505') {
        throw new BadRequestException('Tip sudah pernah diberikan untuk pesanan ini.');
      }
      throw e;
    }

    // Notif cleaner
    try {
      await this.push.send({
        userId: b.cleaner_id,
        title: '🎉 Kamu Dapat Tip!',
        body: `Customer kasih tip Rp ${amount.toLocaleString('id-ID')}. Mantap, kerja kamu dihargai!`,
        data: { type: 'tip.received', bookingId: id, amount: String(amount) },
        channel: 'wallet',
      });
    } catch { /* non-fatal */ }

    return { ok: true, amount, newBalance: balance - amount };
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
