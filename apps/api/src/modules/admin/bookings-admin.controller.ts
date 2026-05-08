import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-bookings')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

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

    const photos = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, photo_type AS "photoType", url, uploaded_at AS "uploadedAt"
        FROM booking_photos WHERE booking_id = ${id}::uuid ORDER BY uploaded_at ASC
    `;

    const charges = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, charge_type AS "chargeType", amount, description, created_at AS "createdAt"
        FROM additional_charges WHERE booking_id = ${id}::uuid ORDER BY created_at ASC
    `;

    const payments = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, amount, status, paid_at AS "paidAt"
        FROM payments WHERE booking_id = ${id}::uuid ORDER BY id DESC LIMIT 5
    `;

    return { booking, photos, charges, payments };
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
    const bookings = await this.prisma.$queryRaw<{ cleaner_id: string | null; cleaner_payout: number | null; total_amount: number }[]>`
      SELECT cleaner_id, cleaner_payout, total_amount FROM bookings WHERE id = ${id}::uuid LIMIT 1
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
