import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';
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
    private readonly storage: StorageService,
  ) {}

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
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.*, s.name AS service_name,
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
      SELECT id, charge_type AS "chargeType", amount, description, created_at AS "createdAt"
        FROM additional_charges WHERE booking_id = ${id}::uuid ORDER BY created_at ASC
    `;

    const payments = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, amount, status, paid_at AS "paidAt"
        FROM payments WHERE booking_id = ${id}::uuid ORDER BY id DESC LIMIT 5
    `;

    return { booking, photos: photosWithUrl, charges, payments };
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
    await this.prisma.$executeRaw`
      UPDATE bookings
         SET status = 'cancelled',
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

    // Referral reward: kalau customer ini di-refer dan ini job pertama dia yang completed
    if (booking?.customer_id) {
      const refRows = await this.prisma.$queryRaw<{ id: string; referrer_id: string; status: string }[]>`
        SELECT id, referrer_id, status FROM referrals
         WHERE referred_id = ${booking.customer_id}::uuid AND status = 'pending' LIMIT 1
      `;
      const referral = refRows[0];
      if (referral) {
        // Read bonus + enabled flag dari app_config (admin-editable)
        const cfgRows = await this.prisma.$queryRaw<{ key: string; value: any }[]>`
          SELECT key, value FROM app_config WHERE key IN ('referral.bonus_amount', 'referral.enabled', 'referral.min_order_amount')
        `;
        const enabled = cfgRows.find((c) => c.key === 'referral.enabled')?.value !== false;
        const REFERRAL_BONUS = Number(cfgRows.find((c) => c.key === 'referral.bonus_amount')?.value ?? 25000);
        const minOrder = Number(cfgRows.find((c) => c.key === 'referral.min_order_amount')?.value ?? 0);

        if (enabled && REFERRAL_BONUS > 0 && Number(booking.total_amount ?? 0) >= minOrder) {
          await this.prisma.$transaction([
            this.prisma.$executeRaw`
              UPDATE referrals SET status = 'qualified', qualified_at = NOW(), bonus_amount = ${REFERRAL_BONUS}::bigint
                WHERE id = ${referral.id}::uuid
            `,
            this.prisma.$executeRaw`
              INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
              VALUES (${referral.referrer_id}::uuid, 'earnings', ${REFERRAL_BONUS}::bigint, 'referral', ${referral.id}::uuid,
                      'CLEARED', NOW(), 'Bonus referral')
            `,
            this.prisma.$executeRaw`
              UPDATE referral_codes SET total_referrals = total_referrals + 1, total_paid = total_paid + ${REFERRAL_BONUS}::bigint
                WHERE user_id = ${referral.referrer_id}::uuid
            `,
          ]);
          void this.push.send({
            userId: referral.referrer_id, channel: 'wallet',
            title: 'Bonus referral masuk! 🎉',
            body: `Rp ${REFERRAL_BONUS.toLocaleString('id-ID')} masuk wallet kamu — teman pakai kode referralmu order pertama.`,
            data: { type: 'referral_bonus' },
          }).catch(() => {});
        }
      }
    }

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

    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE bookings
           SET paid_at = COALESCE(paid_at, NOW()),
               status = ${nextStatus}
         WHERE id = ${id}::uuid
      `,
      this.prisma.$executeRaw`
        INSERT INTO payments (booking_id, amount, status, paid_at, method, reference)
        VALUES (${id}::uuid, ${booking.total_amount}::bigint, 'paid', NOW(), ${method}, ${reference})
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
