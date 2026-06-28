import { BadRequestException, Body, Controller, Get, Logger, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';
import { FlipService } from '../payments/flip.service';

function isMaintenanceError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return ['maintenance', 'pemeliharaan', 'not available', 'not active', 'unavailable',
    'belum aktif', 'channel is currently', 'bank sedang', 'suspended', 'disabled by provider',
  ].some(k => lower.includes(k));
}

@ApiTags('admin-withdrawals')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/withdrawals')
export class AdminWithdrawalsController {
  private readonly log = new Logger(AdminWithdrawalsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly push: PushService,
    private readonly flip: FlipService,
  ) {}

  private async getUserAndAmount(id: string) {
    const r = await this.prisma.$queryRaw<{ user_id: string; amount: number }[]>`
      SELECT user_id, amount FROM withdrawals WHERE id = ${id}::uuid LIMIT 1
    `;
    return r[0];
  }

  @Get()
  @Roles('super_admin', 'finance')
  async list(@Query('status') status: 'pending' | 'approved' | 'rejected' | 'paid' = 'pending') {
    // Approved tab juga include 'auto_approved' (di-set otomatis saat Flip
    // auto-disburse sukses). Tanpa ini, withdrawal yg sukses via Flip gak
    // muncul di tab Approved -> admin gak liat history transfer otomatis.
    const statuses = status === 'approved' ? ['approved', 'auto_approved'] : [status];
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
             w.flip_disbursement_id AS "flipDisbursementId",
             w.processed_at AS "processedAt",
             NULL AS "cleanerTier"
        FROM withdrawals w
        LEFT JOIN users u ON u.id = w.user_id
       WHERE w.review_status = ANY(${statuses}::text[])
       ORDER BY w.requested_at DESC
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
    // Guard: cek status user tidak banned
    const wRows = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT user_id FROM withdrawals WHERE id = ${id}::uuid LIMIT 1
    `;
    if (!wRows[0]) throw new BadRequestException('Withdrawal tidak ditemukan.');
    const userRows = await this.prisma.$queryRaw<{ status: string }[]>`
      SELECT status FROM users WHERE id = ${wRows[0].user_id}::uuid LIMIT 1
    `;
    if (userRows[0]?.status === 'banned') {
      throw new BadRequestException('User sudah di-ban, withdrawal tidak bisa diproses');
    }
    const approveCount = await this.prisma.$executeRaw`
      UPDATE withdrawals
         SET review_status = 'approved',
             status = 'paid',
             reviewed_by = ${admin.id}::uuid,
             reviewed_at = NOW(),
             completed_at = NOW(),
             bank_transfer_ref = ${body.bankTransferRef},
             review_note = ${body.note ?? null}
       WHERE id = ${id}::uuid
         AND review_status = 'pending'
    `;
    if (approveCount === 0n || approveCount === 0) {
      throw new BadRequestException('Withdrawal sudah diproses (bukan pending). Tidak bisa di-approve.');
    }
    // Mark ledger debit CLEARED (saldo benar-benar berkurang)
    await this.prisma.$executeRaw`
      UPDATE wallet_ledger_entries
         SET status = 'CLEARED', cleared_at = NOW()
       WHERE reference_type = 'withdrawal' AND reference_id = ${id}::uuid AND status = 'PENDING'
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'withdrawal.approve',
      resourceType: 'withdrawal',
      resourceId: id,
      changes: { bankTransferRef: body.bankTransferRef, note: body.note ?? null },
      ipAddress: req.ip ?? null,
    });
    const w = await this.getUserAndAmount(id);
    if (w) {
      void this.push.send({ userId: w.user_id, channel: 'wallet', title: 'Penarikan disetujui', body: `Rp ${Number(w.amount).toLocaleString('id-ID')} sudah ditransfer. Ref: ${body.bankTransferRef}`, data: { type: 'withdrawal_approved', withdrawalId: id } }).catch(() => {});
    }
    return { ok: true };
  }

  // Approve via Flip — admin trigger auto-disburse, Flip yang transfer.
  // Cocok untuk withdrawal yang masuk antrian karena di atas threshold tapi rekening udah verified.
  @Post(':id/approve-flip')
  @Roles('super_admin', 'finance')
  async approveViaFlip(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const rows = await this.prisma.$queryRaw<{
      id: string; user_id: string; amount: number; status: string; review_status: string;
      destination_bank_code: string | null; destination_account_number: string | null;
      destination_account_name: string | null; bank_account_id: string | null; customer_bank_account_id: string | null;
      flip_disbursement_id: string | null; flip_idempotency_key: string | null;
    }[]>`
      SELECT id, user_id, amount, status, review_status,
             destination_bank_code, destination_account_number, destination_account_name,
             bank_account_id, customer_bank_account_id, flip_disbursement_id, flip_idempotency_key
        FROM withdrawals WHERE id = ${id}::uuid LIMIT 1
    `;
    const w = rows[0];
    if (!w) throw new NotFoundException('Withdrawal tidak ditemukan.');
    if (w.status !== 'pending') throw new BadRequestException(`Withdrawal status ${w.status}, tidak bisa di-approve auto-transfer.`);
    if (w.flip_disbursement_id) throw new BadRequestException('Withdrawal sudah pernah dikirim ke sistem auto-transfer.');
    if (!w.destination_bank_code || !w.destination_account_number || !w.destination_account_name) {
      throw new BadRequestException('Info rekening tidak lengkap.');
    }
    // Kalau pakai bank_account_id, pastikan verified
    if (w.bank_account_id) {
      const ba = await this.prisma.$queryRaw<{ is_verified: boolean }[]>`
        SELECT is_verified FROM cleaner_bank_accounts WHERE id = ${w.bank_account_id}::uuid LIMIT 1
      `;
      if (!ba[0]?.is_verified) throw new BadRequestException('Rekening belum terverifikasi. Verifikasi dulu atau lakukan transfer manual.');
    }
    if (w.customer_bank_account_id) {
      const ba = await this.prisma.$queryRaw<{ is_verified: boolean }[]>`
        SELECT is_verified FROM customer_bank_accounts WHERE id = ${w.customer_bank_account_id}::uuid LIMIT 1
      `;
      if (!ba[0]?.is_verified) throw new BadRequestException('Rekening customer belum terverifikasi.');
    }

    // Hitung transfer amount setelah fee (kalau cleaner yang bayar)
    const feeRows = await this.prisma.$queryRaw<{ fee: number | null }[]>`SELECT fee FROM withdrawals WHERE id = ${id}::uuid`;
    const fee = Number(feeRows[0]?.fee ?? 0);
    const transferAmount = Number(w.amount) - fee; // kalau fee=0 (owner pays), transfer = full

    const idempKey = w.flip_idempotency_key ?? `WD-ADMIN-${id.slice(0, 8)}-${Date.now()}`;
    let result: any;
    try {
      result = await this.flip.createDisbursement({
        amount: transferAmount,
        bankCode: w.destination_bank_code,
        accountNumber: w.destination_account_number,
        accountHolderName: w.destination_account_name,
        remark: 'JasaBersih withdrawal (admin-approved)',
        idempotencyKey: idempKey,
      });
    } catch (e: any) {
      this.log.error(`approve-flip failed for ${id}: ${e?.message ?? e}`);
      if (isMaintenanceError(e?.message ?? '')) {
        // Bank sedang maintenance — jangan reject withdrawal, biarkan tetap pending
        await this.prisma.$executeRaw`
          UPDATE withdrawals
             SET flip_idempotency_key = ${idempKey},
                 review_note = ${'Bank ' + w.destination_bank_code + ' sedang gangguan/maintenance. Auto-retry oleh admin setelah bank normal.'},
                 reviewed_by = ${admin.id}::uuid
           WHERE id = ${id}::uuid
        `;
        // Notif ke cleaner agar tidak panik
        if (w.user_id) {
          void this.push.send({
            userId: w.user_id,
            title: 'Penarikan Tertunda Sementara',
            body: `Bank ${w.destination_bank_code} sedang gangguan. Penarikan kamu akan diproses segera setelah bank normal kembali.`,
            channel: 'wallet',
            data: { type: 'withdrawal_pending_maintenance', withdrawalId: id },
          }).catch(() => {});
        }
        await this.audit.log({
          adminId: admin.id, action: 'withdrawal.approve_flip_maintenance', resourceType: 'withdrawal', resourceId: id,
          changes: { bank: w.destination_bank_code, error: e?.message },
          ipAddress: req.ip ?? null,
        });
        throw new BadRequestException(
          `Bank ${w.destination_bank_code} sedang maintenance/gangguan. Withdrawal tetap pending — coba approve lagi nanti setelah bank normal. Cleaner sudah dinotifikasi.`
        );
      }
      throw new BadRequestException(`Auto-transfer gagal: ${e?.message ?? 'Coba lagi atau pakai approve manual'}`);
    }

    const flipId = String(result?.id ?? '');
    await this.prisma.$executeRaw`
      UPDATE withdrawals
         SET flip_disbursement_id = ${flipId},
             flip_idempotency_key = ${idempKey},
             status = 'processing',
             review_status = 'approved',
             reviewed_by = ${admin.id}::uuid,
             reviewed_at = NOW()
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'withdrawal.approve_flip',
      resourceType: 'withdrawal',
      resourceId: id,
      changes: { flip_disbursement_id: flipId, amount: Number(w.amount) },
      ipAddress: req.ip ?? null,
    });
    return { ok: true, status: 'processing', flipDisbursementId: flipId, note: 'Flip lagi proses transfer. Status auto-update via callback.' };
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
    // Refund: reverse the PENDING ledger debit dgn entry positif baru
    // (ledger immutable — bikin entry reversal, bukan delete/update)
    const rejectCount = await this.prisma.$executeRaw`
      UPDATE withdrawals
         SET review_status = 'rejected',
             status = 'rejected',
             reviewed_by = ${admin.id}::uuid,
             reviewed_at = NOW(),
             review_note = ${body.reason},
             failure_reason = ${body.reason}
       WHERE id = ${id}::uuid
         AND review_status = 'pending'
    `;
    if (rejectCount === 0n || rejectCount === 0) {
      throw new BadRequestException('Withdrawal sudah diproses (bukan pending). Tidak bisa ditolak.');
    }
    // Mark original debit CANCELLED (status transition allowed by trigger)
    await this.prisma.$executeRaw`
      UPDATE wallet_ledger_entries
         SET status = 'CANCELLED', cleared_at = NOW()
       WHERE reference_type = 'withdrawal' AND reference_id = ${id}::uuid AND status = 'PENDING'
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'withdrawal.reject',
      resourceType: 'withdrawal',
      resourceId: id,
      changes: { reason: body.reason },
      ipAddress: req.ip ?? null,
    });
    const w = await this.getUserAndAmount(id);
    if (w) {
      void this.push.send({ userId: w.user_id, channel: 'wallet', title: 'Penarikan ditolak', body: body.reason, data: { type: 'withdrawal_rejected', withdrawalId: id } }).catch(() => {});
    }
    return { ok: true };
  }
}
