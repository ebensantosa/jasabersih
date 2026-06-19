import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly push: PushService,
    private readonly jobs: JobsGateway,
    private readonly storage: StorageService,
    private readonly referralPayout: ReferralPayoutService,
  ) {}

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
    const paidAt = body.paymentStatus === 'paid' ? new Date().toISOString() : null;
    const lng = body.lng ?? 110.3695;
    const lat = body.lat ?? -7.7956;

    const row = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO bookings (
         customer_id, cleaner_id, service_id, pricing_mode, package_id,
         status, form_snapshot, scheduled_at, address_line, location,
         customer_notes, admin_notes,
         base_amount, total_amount, paid_at, matched_at
       )
       VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid,
         $6, $7::jsonb, $8::timestamptz, $9,
         ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
         $12, $13, $14, $15, $16, $17
       ) RETURNING id`,
      customerId,
      body.cleanerId ?? null,
      body.serviceId ?? null,
      body.pricingMode,
      body.packageId ?? null,
      body.cleanerId ? 'matched' : status,
      JSON.stringify({ createdByAdmin: true, categoryName: 'Manual Admin' }),
      body.scheduledAt,
      body.addressLine,
      lng, lat,
      body.customerNotes ?? null,
      `[admin manual] ${body.adminNote ?? 'created by admin'}`,
      body.baseAmount ?? body.totalAmount,
      body.totalAmount,
      paidAt,
      body.cleanerId ? new Date().toISOString() : null,
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
        channel: 'booking',
        title: 'Job baru di-assign admin',
        body: 'Admin assign job manual untuk kamu. Tap untuk lihat detail.',
        data: { type: 'job_assigned', bookingId },
      }).catch(() => {});
    }

    if (bookingId && !body.cleanerId && body.paymentStatus === 'paid') {
      void this.jobs.broadcastIncomingJob(bookingId).catch(() => {});
    }

    return { id: bookingId, customerId, status };
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

    const photos = await this.prisma.$queryRaw<{ id: string; photoType: string; storagePath: string; uploadedAt: Date }[]>`
      SELECT id, photo_type AS "photoType", storage_path AS "storagePath", uploaded_at AS "uploadedAt"
        FROM booking_photos WHERE booking_id = ${id}::uuid ORDER BY uploaded_at ASC
    `;
    const photosWithUrl = photos.map((p) => ({
      ...p,
      url: this.storage.getPublicUrl(p.storagePath),
    }));

    const charges = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, reason, amount, status, requested_at AS "requestedAt", resolved_at AS "resolvedAt"
        FROM additional_charges WHERE booking_id = ${id}::uuid ORDER BY requested_at ASC
    `;

    const payments = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, amount, status, paid_at AS "paidAt"
        FROM payments WHERE booking_id = ${id}::uuid ORDER BY id DESC LIMIT 5
    `;

    return { booking, photos: photosWithUrl, charges, payments };
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
    const partyRows = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_id: string | null }[]>`
      SELECT customer_id, cleaner_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const parties = partyRows[0];

    await this.prisma.$executeRaw`
      UPDATE bookings
         SET status = 'canceled',
             canceled_at = NOW(),
             cancellation_reason = ${body.reason},
             cancelled_by = ${admin.id}::uuid
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'booking.force_cancel',
      resourceType: 'booking',
      resourceId: id,
      changes: { reason: body.reason, refundAmount: body.refundAmount ?? null },
      ipAddress: req.ip ?? null,
    });

    // Notif kedua belah pihak
    if (parties?.customer_id) {
      void this.push.send({
        userId: parties.customer_id, channel: 'booking',
        title: 'Pesanan dibatalkan admin',
        body: `Alasan: ${body.reason}`,
        data: { type: 'booking_canceled_admin', bookingId: id, reason: body.reason },
      }).catch(() => {});
    }
    if (parties?.cleaner_id) {
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
    const bookings = await this.prisma.$queryRaw<{ cleaner_id: string | null; customer_id: string | null; cleaner_payout: number | null; total_amount: number }[]>`
      SELECT cleaner_id, customer_id, cleaner_payout, total_amount FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const booking = bookings[0];

    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE bookings
           SET status = 'completed',
               completed_at = COALESCE(completed_at, NOW())
         WHERE id = ${id}::uuid
      `,
      // Auto-credit cleaner ledger (cleaner_payout amount; CLEARED langsung)
      ...(booking?.cleaner_id && (booking.cleaner_payout ?? 0) > 0 ? [
        this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (
            ${booking.cleaner_id}::uuid, 'earnings', ${booking.cleaner_payout}::bigint,
            'booking', ${id}::uuid, 'CLEARED', NOW(),
            'Pembayaran job completed'
          )
          ON CONFLICT DO NOTHING
        `,
      ] : []),
    ]);

    // Referral commission (NEW model): 5% recurring tiap order completed dari
    // customer yg di-refer. Logic + idempotency di ReferralPayoutService.
    await this.referralPayout.payoutForCompletedBooking(id);

    // Push notif (fire-and-forget)
    if (booking?.customer_id) {
      void this.push.send({
        userId: booking.customer_id, channel: 'booking',
        title: 'Pesanan selesai', body: 'Yuk beri rating untuk cleaner kamu!',
        data: { type: 'booking_completed', bookingId: id },
      }).catch(() => {});
    }
    if (booking?.cleaner_id && (booking.cleaner_payout ?? 0) > 0) {
      void this.push.send({
        userId: booking.cleaner_id, channel: 'wallet',
        title: 'Saldo bertambah', body: `Pendapatan Rp ${Number(booking.cleaner_payout).toLocaleString('id-ID')} masuk wallet kamu.`,
        data: { type: 'wallet_credit', bookingId: id },
      }).catch(() => {});
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
          await this.prisma.$executeRaw`DELETE FROM bookings WHERE id = ${id}::uuid`;
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
    await this.prisma.$executeRaw`
      UPDATE bookings
         SET cleaner_id = ${body.cleanerId}::uuid,
             status = 'matched',
             matched_at = NOW()
       WHERE id = ${id}::uuid
    `;
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
