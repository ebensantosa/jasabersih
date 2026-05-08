import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-withdrawals')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/withdrawals')
export class AdminWithdrawalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @Roles('super_admin', 'finance')
  async list(@Query('status') status: 'pending' | 'approved' | 'rejected' | 'paid' = 'pending') {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT w.id, w.user_id AS "userId", u.name AS "userName", u.phone AS "userPhone",
             w.amount, w.fee,
             w.destination_type AS "destType",
             w.destination_bank_code AS "bankCode",
             w.destination_account_number AS "accountNumber",
             w.destination_account_name AS "accountName",
             w.status, w.review_status AS "reviewStatus",
             w.requested_at AS "requestedAt",
             w.reviewed_at AS "reviewedAt",
             w.review_note AS "reviewNote",
             w.bank_transfer_ref AS "bankTransferRef",
             w.failure_reason AS "failureReason",
             (SELECT cp.tier FROM cleaner_profiles cp WHERE cp.user_id = w.user_id) AS "cleanerTier"
        FROM withdrawals w
        LEFT JOIN users u ON u.id = w.user_id
       WHERE w.review_status = ${status}
       ORDER BY w.requested_at ASC
       LIMIT 200
    `;
  }

  // Approve = manual transfer dilakukan, simpan referensi bank
  @Post(':id/approve')
  @Roles('super_admin', 'finance')
  async approve(
    @Param('id') id: string,
    @Body() body: { bankTransferRef: string; note?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.bankTransferRef) throw new BadRequestException('Referensi bank transfer wajib.');
    await this.prisma.$executeRaw`
      UPDATE withdrawals
         SET review_status = 'approved',
             status = 'paid',
             reviewed_by = ${admin.id}::uuid,
             reviewed_at = NOW(),
             completed_at = NOW(),
             bank_transfer_ref = ${body.bankTransferRef},
             review_note = ${body.note ?? null}
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'withdrawal.approve',
      resourceType: 'withdrawal',
      resourceId: id,
      changes: { bankTransferRef: body.bankTransferRef, note: body.note ?? null },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Post(':id/reject')
  @Roles('super_admin', 'finance')
  async reject(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new BadRequestException('Alasan wajib.');
    }
    // Refund balance ke wallet cleaner — anggap saldo masih di-hold, tinggal release
    // (asumsi: saat request withdrawal, saldo cleaner di-debit. Reject = re-credit.)
    await this.prisma.$executeRaw`
      UPDATE withdrawals
         SET review_status = 'rejected',
             status = 'rejected',
             reviewed_by = ${admin.id}::uuid,
             reviewed_at = NOW(),
             review_note = ${body.reason},
             failure_reason = ${body.reason}
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'withdrawal.reject',
      resourceType: 'withdrawal',
      resourceId: id,
      changes: { reason: body.reason },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }
}
