import { BadRequestException, Body, Controller, Get, Logger, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';
import { ReferralPayoutService } from '../referral/referral-payout.service';
import { JobsGateway } from '../jobs/jobs.gateway';
import { StorageService } from '../storage/storage.service';

@ApiTags('admin-bookings')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/bookings')
export class AdminBookingsController {
  private readonly log = new Logger(AdminBookingsController.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly push: PushService,
    private readonly jobs: JobsGateway,
    private readonly storage: StorageService,
    private readonly referralPayout: ReferralPayoutService,
  ) {}

  // Ambil atau buat akun customer khusus admin (phone: +62000000000001, name: "Admin JasaBersih").
  // Dipakai sebagai customer_id untuk manual booking yang dibuat admin sendiri.
  @Get('admin-customer')
  @Roles('super_admin', 'ops', 'support')
  async getAdminCustomer() {
    const ADMIN_PHONE = '+62000000000001';
    const existing = await this.prisma.$queryRaw<{ id: string; name: string; phone: string }[]>`
      SELECT id, name, phone FROM users WHERE phone = ${ADMIN_PHONE} LIMIT 1
    `;
    if (existing.length > 0) return existing[0];

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 12);
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; phone: string }[]>`
      INSERT INTO users (phone, name, email, password_hash, phone_verified_at, is_customer, status)
      VALUES (${ADMIN_PHONE}, 'Admin JasaBersih', 'admin-booking@jasabersih.internal', ${passwordHash}, NOW(), TRUE, 'active')
      RETURNING id, name, phone
    `;
    return rows[0];
  }

  // Admin manual create booking — biasanya untuk customer yg order via WA/telp,
  // atau perbaikan booking yang gagal create otomatis.
  @Post()
  @Roles('super_admin', 'ops', 'support')
  async createManual(
    @Body() body: {
      customerPhone: string;         // wajib — admin pilih/buat customer via phone
      customerName?: string;          // optional kalau customer baru
      pricingMode: 'package' | 'hourly' | 'wa_survey';
      packageId?: string;
      serviceId?: string;
      scheduledAt: string;            // ISO datetime
      addressLine: string;
      lat?: number;
      lng?: number;
      totalAmount: number;
      baseAmount?: number;
      customerNotes?: string;
      cleanerId?: string;             // optional — kalau admin sekalian assign
      paymentStatus?: 'unpaid' | 'paid'; // default unpaid → pending_payment, paid → searching
      adminNote?: string;
      cityName?: string;
      conditionPhotos?: string[];
    },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    // Validasi minimal
    if (!body?.customerPhone || !body?.addressLine || !body?.scheduledAt || !body?.totalAmount) {
      throw new BadRequestException('customerPhone, addressLine, scheduledAt, totalAmount wajib');
    }
    const digits = body.customerPhone.replace(/\D/g, '');
    const phone = digits.startsWith('62') ? `+${digits}` : digits.startsWith('0') ? `+62${digits.slice(1)}` : `+62${digits}`;

    // Cari customer existing atau bikin baru
    let customerId: string;
    const existing = await this.prisma.$queryRaw<{ id: string; is_customer: boolean }[]>`
      SELECT id, is_customer FROM users WHERE phone = ${phone} LIMIT 1
    `;
    if (existing.length > 0) {
      customerId = existing[0]!.id;
      // Pastikan flag customer
      if (!existing[0]!.is_customer) {
        await this.prisma.$executeRaw`UPDATE users SET is_customer = TRUE WHERE id = ${customerId}::uuid`;
      }
    } else {
      // Customer baru — admin yg create (skip OTP)
      const name = body.customerName?.trim() || `Customer ${phone.slice(-4)}`;
      const tempPass = require('crypto').randomBytes(16).toString('hex');
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(tempPass, 12);
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO users (phone, name, password_hash, phone_verified_at, is_customer, status)
        VALUES (${phone}, ${name}, ${passwordHash}, NOW(), TRUE, 'active')
        RETURNING id
      `;
      customerId = rows[0]!.id;
    }

    const status = body.paymentStatus === 'paid' ? 'searching' : 'pending_payment';
    const isPaid = body.paymentStatus === 'paid';
    const lng = body.lng ?? 110.3695;
    const lat = body.lat ?? -7.7956;

    // Kalau cleaner langsung di-assign, hitung cleaner_payout sekarang pakai commission_tiers
    let assignedCleanerPayout: number | null = null;
    if (body.cleanerId) {
      const base = body.baseAmount ?? body.totalAmount;
      const cleanerProfile = await this.prisma.$queryRaw<{ brings_tools: boolean | null }[]>`
        SELECT brings_tools FROM cleaner_profiles WHERE user_id = ${body.cleanerId}::uuid LIMIT 1
      `;
      const bringsTools = !!cleanerProfile[0]?.brings_tools;
      const commTiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
        SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools
          FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
      `;
      const tier = commTiers.find((t) => base >= Number(t.range_min ?? 0) && (t.range_max == null || base <= Number(t.range_max)));
      const sharePct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
      assignedCleanerPayout = Math.round(base * sharePct / 100);
    }

    const row = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO bookings (
         customer_id, cleaner_id, service_id, pricing_mode, package_id,
         status, form_snapshot, scheduled_at, address_line, location,
         customer_notes, admin_notes,
         base_amount, total_amount, cleaner_payout, paid_at, matched_at
       )
       VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid,
         $6, $7::jsonb, $8::timestamptz, $9,
         ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
         $12, $13, $14, $15, $16::bigint,
         CASE WHEN $17 THEN NOW() ELSE NULL END,
         CASE WHEN $18::uuid IS NOT NULL THEN NOW() ELSE NULL END
       ) RETURNING id`,
      customerId,
      body.cleanerId ?? null,
      body.serviceId ?? null,
      body.pricingMode,
      body.packageId ?? null,
      body.cleanerId ? 'matched' : status,
      JSON.stringify({ createdByAdmin: true, categoryName: 'Pesanan Admin', cityName: body.cityName ?? null, conditionPhotos: body.conditionPhotos ?? [] }),
      body.scheduledAt,
      body.addressLine,
      lng, lat,
      body.customerNotes ?? null,
      `[admin manual] ${body.adminNote ?? 'created by admin'}${body.cityName ? ` | kota: ${body.cityName}` : ''}`,
      body.baseAmount ?? body.totalAmount,
      body.totalAmount,
      assignedCleanerPayout,
      isPaid,
      body.cleanerId ?? null,
    );

    const bookingId = row[0]?.id;
    await this.audit.log({
      adminId: admin.id, action: 'booking.create_manual', resourceType: 'booking', resourceId: bookingId,
      changes: { customerPhone: phone, totalAmount: body.totalAmount, cleanerId: body.cleanerId ?? null },
      ipAddress: req.ip ?? null,
    });

    // Notif customer kalau dia existing — biar tahu admin buatkan order
    if (existing.length > 0 && bookingId) {
      const needsPayment = !body.paymentStatus || body.paymentStatus === 'unpaid';
      void this.push.send({
        userId: customerId,
        channel: 'booking',
        title: needsPayment ? 'Pesanan dibuat — tunggu pembayaran' : 'Pesanan dibuat oleh admin',
        body: needsPayment
          ? `Admin buatkan pesanan Rp ${Number(body.totalAmount).toLocaleString('id-ID')}. Tap untuk bayar & mulai cari cleaner.`
          : `Admin buatkan pesanan untukmu — Rp ${Number(body.totalAmount).toLocaleString('id-ID')}. Cleaner segera dicari.`,
        data: { type: 'booking_created_by_admin', bookingId },
      }).catch(() => {});
    }

    // Kalau cleaner di-assign, notif cleaner juga
    if (body.cleanerId && bookingId) {
      void this.push.send({
        userId: body.cleanerId,
        channel: 'incoming_job_v2',
        title: 'Job baru di-assign admin',
        body: 'Admin assign job manual untuk kamu. Tap untuk lihat detail.',
        data: { type: 'job_assigned', bookingId },
        targetMode: 'freelancer',
      }).catch(() => {});
    }

    if (bookingId && !body.cleanerId && body.paymentStatus === 'paid') {
      this.log.log(`createManual triggering broadcastIncomingJob bookingId=${bookingId} status=${status}`);
      void this.jobs.broadcastIncomingJob(bookingId).catch((e) => this.log.error(`broadcastIncomingJob error: ${e?.message}`));
    } else {
      this.log.log(`createManual skip broadcast bookingId=${bookingId} cleanerId=${body.cleanerId ?? null} paymentStatus=${body.paymentStatus ?? 'unpaid'}`);
    }

    return { id: bookingId, customerId, status };
  }

  // Trigger ulang broadcast incoming-job ke semua cleaner online untuk booking
  // yang sudah di-searching tapi belum ada yang ambil (misal cleaner offline saat broadcast pertama).
  @Post(':id/broadcast')
  @Roles('super_admin', 'ops', 'support')
  async broadcastJob(@Param('id') id: string) {
    await this.jobs.broadcastIncomingJob(id);
    return { ok: true };
  }

  // Bookings yang searching > 5 menit dan belum ada cleaner ambil — kemungkinan
  // di luar coverage area. Admin perlu lihat ini untuk assign manual.
  @Get('needs-attention')
  @Roles('super_admin', 'ops', 'support')
  async needsAttention() {
    return this.prisma.$queryRaw`
      SELECT b.id, b.address_line AS "addressLine", b.total_amount AS "totalAmount",
             b.scheduled_at AS "scheduledAt", b.created_at AS "createdAt",
             EXTRACT(EPOCH FROM (NOW() - COALESCE(b.paid_at, b.created_at)))::int AS "searchingSec",
             s.name AS "serviceName",
             cu.name AS "customerName", cu.phone AS "customerPhone"
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN users cu ON cu.id = b.customer_id
       WHERE b.status = 'searching'
         AND b.cleaner_id IS NULL
         AND COALESCE(b.paid_at, b.created_at) < NOW() - INTERVAL '5 minutes'
       ORDER BY b.created_at ASC
       LIMIT 100
    `;
  }

  // Detail lengkap booking — header, timeline (timestamps), customer, cleaner, payment, photos
  @Get(':id')
  @Roles('super_admin', 'ops', 'support', 'fraud_analyst')
  async detail(@Param('id') id: string) {
    // Explicit columns — exclude PostGIS location (JSON serialize fail → 500)
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.status, b.pricing_mode, b.total_amount, b.base_amount,
             b.scheduled_at, b.address_line, b.customer_notes, b.form_snapshot,
             b.customer_id, b.cleaner_id, b.service_id, b.package_id,
             b.cleaner_payout, b.matched_at, b.paid_at, b.canceled_at,
             b.completed_at, b.created_at,
             ST_X(b.location::geometry) AS lng, ST_Y(b.location::geometry) AS lat,
             s.name AS service_name,
             cu.name AS customer_name, cu.phone AS customer_phone, cu.email AS customer_email,
             cl.name AS cleaner_name, cl.phone AS cleaner_phone
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN users cu ON cu.id = b.customer_id
        LEFT JOIN users cl ON cl.id = b.cleaner_id
        WHERE b.id = ${id}::uuid LIMIT 1
    `;
    if (rows.length === 0) throw new NotFoundException('Booking tidak ditemukan.');
    const booking = rows[0];

    const photos = await this.prisma.$queryRaw<{ id: string; photoType: string; storagePath: string; uploadedAt: Date; description: string | null }[]>`
      SELECT id, photo_type AS "photoType", storage_path AS "storagePath", uploaded_at AS "uploadedAt", description
        FROM booking_photos WHERE booking_id = ${id}::uuid ORDER BY uploaded_at ASC
    `;
    const photosWithUrl = photos.map((p) => ({
      ...p,
      url: this.storage.getPublicUrl(p.storagePath),
    }));

    const charges = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, reason, amount, status, created_at AS "requestedAt", decided_at AS "resolvedAt"
        FROM booking_upcharges WHERE booking_id = ${id}::uuid ORDER BY created_at ASC
    `;

    const payments = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, amount, status, paid_at AS "paidAt"
        FROM payments WHERE booking_id = ${id}::uuid ORDER BY id DESC LIMIT 5
    `;

    const tipRows = await this.prisma.$queryRaw<{ tipAmount: number }[]>`
      SELECT COALESCE(tip_amount, 0)::bigint AS "tipAmount"
        FROM ratings WHERE booking_id = ${id}::uuid LIMIT 1
    `;
    const tipAmount = Number(tipRows[0]?.tipAmount ?? 0);

    return { booking, photos: photosWithUrl, charges, payments, tipAmount };
  }

  // Issue refund as non-cashable credit to customer's wallet.
  @Post(':id/refund-credit')
  @Roles('super_admin', 'ops')
  async refundCredit(
    @Param('id') id: string,
    @Body() body: { amount: number; reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body.amount || body.amount <= 0) throw new BadRequestException('Nominal refund harus > 0');
    if (!body.reason || body.reason.length < 5) throw new BadRequestException('Alasan min 5 karakter');
    const bk = await this.prisma.$queryRaw<{ customer_id: string; total_amount: number }[]>`
      SELECT customer_id, total_amount FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    if (bk.length === 0) throw new NotFoundException('Booking tidak ditemukan');
    if (!bk[0]!.customer_id) throw new BadRequestException('Booking tidak ada customer');
    if (body.amount > Number(bk[0]!.total_amount)) throw new BadRequestException('Refund tidak boleh > total booking');

    // Cegah total refund melebihi nilai pesanan (guard terhadap multiple refund calls).
    const existingRefunds = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(amount), 0)::bigint AS total
        FROM wallet_ledger_entries
       WHERE reference_type = 'booking' AND reference_id = ${id}::uuid
         AND account_type = 'refund_credit'
    `;
    const alreadyRefunded = Number(existingRefunds[0]?.total ?? 0);
    const bookingTotal = Number(bk[0]?.total_amount ?? 0);
    if (alreadyRefunded + body.amount > bookingTotal) {
      throw new BadRequestException(`Total refund (Rp ${(alreadyRefunded + body.amount).toLocaleString('id-ID')}) melebihi nilai pesanan (Rp ${bookingTotal.toLocaleString('id-ID')}).`);
    }

    await this.prisma.$executeRaw`
      INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
      VALUES (${bk[0]!.customer_id}::uuid, 'refund_credit', ${body.amount}, 'booking', ${id}::uuid, 'CLEARED', NOW(), ${body.reason})
    `;
    await this.audit.log({
      adminId: admin.id, action: 'booking.refund_credit', resourceType: 'booking', resourceId: id,
      changes: { amount: body.amount, reason: body.reason }, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Post(':id/force-cancel')
  @Roles('super_admin', 'ops')
  async forceCancel(
    @Param('id') id: string,
    @Body() body: { reason: string; refundAmount?: number },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new BadRequestException('Alasan wajib (min 5 karakter).');
    }
    // Ambil party info (customer + cleaner) sebelum update
    const partyRows = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_id: string | null; status: string }[]>`
      SELECT customer_id, cleaner_id, status FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const parties = partyRows[0];
    if (parties?.status === 'completed' || parties?.status === 'canceled') {
      throw new BadRequestException('Booking sudah selesai/dibatalkan');
    }

    await this.prisma.$executeRaw`
      UPDATE bookings
         SET status = 'canceled',
             canceled_at = NOW(),
             cancellation_reason = ${body.reason},
             cancelled_by = ${admin.id}::uuid
       WHERE id = ${id}::uuid
    `;
    // Tutup modal job di semua HP cleaner yang sedang online kalau booking masih searching
    if (parties?.status === 'searching') {
      this.jobs.emitJobTaken(id, 'admin');
    }
    await this.audit.log({
      adminId: admin.id,
      action: 'booking.force_cancel',
      resourceType: 'booking',
      resourceId: id,
      changes: { reason: body.reason, refundAmount: body.refundAmount ?? null },
      ipAddress: req.ip ?? null,
    });

    // WebSocket real-time update + FCM push ke kedua belah pihak
    if (parties?.customer_id) {
      this.jobs.emitBookingStatus(parties.customer_id, { bookingId: id, status: 'canceled' });
      void this.push.send({
        userId: parties.customer_id, channel: 'booking',
        title: 'Pesanan dibatalkan admin',
        body: `Alasan: ${body.reason}`,
        data: { type: 'booking_canceled_admin', bookingId: id, reason: body.reason },
      }).catch(() => {});
    }
    if (parties?.cleaner_id) {
      this.jobs.emitBookingStatus(parties.cleaner_id, { bookingId: id, status: 'canceled' });
      void this.push.send({
        userId: parties.cleaner_id, channel: 'booking',
        title: 'Job dibatalkan admin',
        body: `Alasan: ${body.reason}`,
        data: { type: 'job_canceled_admin', bookingId: id, reason: body.reason },
      }).catch(() => {});
    }
    return { ok: true };
  }

  @Post(':id/force-complete')
  @Roles('super_admin', 'ops')
  async forceComplete(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new BadRequestException('Alasan wajib.');
    }
    // Get booking info untuk auto-credit cleaner
    const bookings = await this.prisma.$queryRaw<{ cleaner_id: string | null; customer_id: string | null; cleaner_payout: number | null; total_amount: number; base_amount: number | null; status: string }[]>`
      SELECT cleaner_id, customer_id, cleaner_payout, total_amount, base_amount, status FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    if (bookings[0]?.status === 'completed') {
      throw new BadRequestException('Booking sudah selesai');
    }
    const booking = bookings[0];

    // Bug E fix: if cleaner exists but payout is null/0, compute fallback using base_amount * 0.6
    if (booking?.cleaner_id && (!booking.cleaner_payout || Number(booking.cleaner_payout) <= 0)) {
      const base = Number(booking.base_amount ?? booking.total_amount ?? 0);
      if (base > 0) {
        const fallbackPayout = Math.round(base * 0.6);
        await this.prisma.$executeRaw`
          UPDATE bookings SET cleaner_payout = ${fallbackPayout}::bigint WHERE id = ${id}::uuid
        `;
        booking.cleaner_payout = fallbackPayout;
      }
    }

    // Dedup guard: wallet_ledger_entries is partitioned so ON CONFLICT DO NOTHING
    // is a no-op. Use booking_earning_dedup table instead.
    let earningAlreadyCredited = true;
    if (booking?.cleaner_id && (booking.cleaner_payout ?? 0) > 0) {
      const dedupCount = await this.prisma.$executeRaw`
        INSERT INTO booking_earning_dedup (booking_id, user_id)
        VALUES (${id}::uuid, ${booking.cleaner_id}::uuid)
        ON CONFLICT DO NOTHING
      `;
      earningAlreadyCredited = dedupCount === 0;
    }

    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE bookings
           SET status = 'completed',
               completed_at = COALESCE(completed_at, NOW())
         WHERE id = ${id}::uuid
      `,
      // Auto-credit cleaner ledger (cleaner_payout amount; CLEARED langsung)
      ...(booking?.cleaner_id && (booking.cleaner_payout ?? 0) > 0 && !earningAlreadyCredited ? [
        this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (
            ${booking.cleaner_id}::uuid, 'earnings', ${booking.cleaner_payout}::bigint,
            'booking', ${id}::uuid, 'CLEARED', NOW(),
            'Pembayaran job completed'
          )
        `,
      ] : []),
    ]);

    // Referral commission (NEW model): 5% recurring tiap order completed dari
    // customer yg di-refer. Logic + idempotency di ReferralPayoutService.
    await this.referralPayout.payoutForCompletedBooking(id);

    // WebSocket real-time update + FCM push
    if (booking?.customer_id) {
      this.jobs.emitBookingStatus(booking.customer_id, { bookingId: id, status: 'completed' });
      void this.push.send({
        userId: booking.customer_id, channel: 'booking',
        title: 'Pesanan selesai', body: 'Yuk beri rating untuk cleaner kamu!',
        data: { type: 'booking_completed', bookingId: id },
      }).catch(() => {});
    }
    if (booking?.cleaner_id) {
      this.jobs.emitBookingStatus(booking.cleaner_id, { bookingId: id, status: 'completed' });
      if ((booking.cleaner_payout ?? 0) > 0) {
        void this.push.send({
          userId: booking.cleaner_id, channel: 'wallet',
          title: 'Saldo bertambah', body: `Pendapatan Rp ${Number(booking.cleaner_payout).toLocaleString('id-ID')} masuk wallet kamu.`,
          data: { type: 'wallet_credit', bookingId: id },
        }).catch(() => {});
      }
    }

    await this.audit.log({
      adminId: admin.id,
      action: 'booking.force_complete',
      resourceType: 'booking',
      resourceId: id,
      changes: { reason: body.reason, cleanerPayout: booking?.cleaner_payout ?? 0 },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Post(':id/force-mark-paid')
  @Roles('super_admin', 'ops')
  async forceMarkPaid(
    @Param('id') id: string,
    @Body() body: { reason: string; method?: string; reference?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new BadRequestException('Alasan wajib (min 5 karakter).');
    }
    const rows = await this.prisma.$queryRaw<{ id: string; customer_id: string | null; total_amount: number; status: string; paid_at: Date | null }[]>`
      SELECT id, customer_id, total_amount, status, paid_at
        FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const booking = rows[0];
    if (!booking) throw new NotFoundException('Booking tidak ditemukan.');
    if (booking.paid_at) {
      throw new BadRequestException('Booking sudah berstatus paid.');
    }

    const nextStatus = booking.status === 'pending_payment' ? 'searching' : booking.status;
    const method = body.method ?? 'manual_admin';
    const reference = body.reference ?? `admin:${admin.id}`;
    const manualPayload = JSON.stringify({
      source: 'admin_force_mark_paid',
      reason: body.reason,
      adminId: admin.id,
      method,
      reference,
      markedAt: new Date().toISOString(),
    });

    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE bookings
           SET paid_at = COALESCE(paid_at, NOW()),
               status = ${nextStatus}
         WHERE id = ${id}::uuid
      `,
      this.prisma.$executeRaw`
        INSERT INTO payments (booking_id, amount, status, paid_at, payment_method, tripay_reference)
        VALUES (${id}::uuid, ${booking.total_amount}::bigint, 'paid', NOW(), ${method}, ${reference})
      `,
      this.prisma.$executeRaw`
        UPDATE payments
           SET status = 'paid',
               paid_at = COALESCE(paid_at, NOW()),
               callback_payload = COALESCE(callback_payload, ${manualPayload}::jsonb)
         WHERE booking_id = ${id}::uuid
           AND status = 'pending'
      `,
    ]);

    if (booking.customer_id) {
      this.jobs.emitBookingStatus(booking.customer_id, { bookingId: id, status: nextStatus });
      void this.push.send({
        userId: booking.customer_id, channel: 'booking',
        title: 'Pembayaran dikonfirmasi',
        body: 'Admin telah mengonfirmasi pembayaran kamu. Mencari cleaner...',
        data: { type: 'payment_confirmed', bookingId: id },
      }).catch(() => {});
    }

    if (nextStatus === 'searching') {
      void this.jobs.broadcastIncomingJob(id).catch(() => {});
    }

    await this.audit.log({
      adminId: admin.id,
      action: 'booking.force_mark_paid',
      resourceType: 'booking',
      resourceId: id,
      changes: { reason: body.reason, method, reference, amount: booking.total_amount },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Post('bulk-action')
  @Roles('super_admin', 'ops')
  async bulkAction(
    @Body() body: { ids: string[]; action: 'cancel' | 'complete' | 'mark_paid' | 'delete'; reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids wajib (array non-empty).');
    }
    if (body.ids.length > 200) {
      throw new BadRequestException('Maksimal 200 booking per bulk action.');
    }
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new BadRequestException('Alasan wajib (min 5 karakter).');
    }
    const allowed = ['cancel', 'complete', 'mark_paid', 'delete'] as const;
    if (!allowed.includes(body.action)) throw new BadRequestException('Action tidak valid.');

    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of body.ids) {
      try {
        if (body.action === 'cancel') {
          await this.forceCancel(id, { reason: body.reason }, admin, req);
        } else if (body.action === 'complete') {
          await this.forceComplete(id, { reason: body.reason }, admin, req);
        } else if (body.action === 'mark_paid') {
          await this.forceMarkPaid(id, { reason: body.reason }, admin, req);
        } else if (body.action === 'delete') {
          const statusRow = await this.prisma.$queryRaw<{ status: string }[]>`SELECT status FROM bookings WHERE id = ${id}::uuid LIMIT 1`;
          await this.prisma.$executeRaw`DELETE FROM bookings WHERE id = ${id}::uuid`;
          if (statusRow[0]?.status === 'searching') this.jobs.emitJobTaken(id, 'admin');
          await this.audit.log({
            adminId: admin.id,
            action: 'booking.delete',
            resourceType: 'booking',
            resourceId: id,
            changes: { reason: body.reason },
            ipAddress: req.ip ?? null,
          });
        }
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message ?? 'unknown' });
      }
    }
    return { ok: true, results, total: body.ids.length, succeeded: results.filter((r) => r.ok).length };
  }

  @Post(':id/reassign')
  @Roles('super_admin', 'ops')
  async reassign(
    @Param('id') id: string,
    @Body() body: { cleanerId: string; reason?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.cleanerId) throw new BadRequestException('cleanerId wajib.');
    const oldCleanerRows = await this.prisma.$queryRaw<{ cleaner_id: string | null }[]>`
      SELECT cleaner_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const oldCleanerId = oldCleanerRows[0]?.cleaner_id ?? null;
    await this.prisma.$executeRaw`
      UPDATE bookings
         SET cleaner_id = ${body.cleanerId}::uuid,
             status = 'matched',
             matched_at = NOW()
       WHERE id = ${id}::uuid
    `;
    if (oldCleanerId) {
      void this.push.send({ userId: oldCleanerId, title: 'Job Dipindahkan', body: `Job #${id.slice(0, 8)} telah dipindahkan ke cleaner lain.` }).catch(() => {});
    }
    await this.audit.log({
      adminId: admin.id,
      action: 'booking.reassign',
      resourceType: 'booking',
      resourceId: id,
      changes: { cleanerId: body.cleanerId, reason: body.reason ?? null },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }
}
