import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CustomerGuard } from '../auth/role.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { FlipService } from '../payments/flip.service';

const RequestWithdrawalSchema = z.object({
  amount: z.number().int().positive(),
  bankAccountId: z.string().uuid(),
});
type RequestWithdrawalDto = z.infer<typeof RequestWithdrawalSchema>;

@ApiTags('customer-wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CustomerGuard)
@Controller('customer')
export class CustomerWalletController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flip: FlipService,
  ) {}

  private async getCfg(): Promise<{
    minAmount: number;
    maxDaily: number;
    cooldownHours: number;
    flipFeeVa: number;
    flipFeeEwallet: number;
  }> {
    const rows = await this.prisma.$queryRaw<{ key: string; value: unknown }[]>`
      SELECT key, value FROM app_config WHERE key IN
        ('withdrawal.min_amount', 'withdrawal.max_daily', 'withdrawal.cooldown_hours',
         'withdrawal.flip_fee_va', 'withdrawal.flip_fee_ewallet', 'feature.min_withdrawal')
    `;
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const num = (k: string, fallback: number): number => {
      const v = m.get(k);
      if (v == null) return fallback;
      const n = Number(typeof v === 'string' ? (v as string).replace(/"/g, '') : v);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      minAmount: num('withdrawal.min_amount', num('feature.min_withdrawal', 50000)),
      maxDaily: num('withdrawal.max_daily', 0),
      cooldownHours: num('withdrawal.cooldown_hours', 4),
      flipFeeVa: num('withdrawal.flip_fee_va', 2500),
      flipFeeEwallet: num('withdrawal.flip_fee_ewallet', 4000),
    };
  }

  private getFlipFee(bankCode: string, cfg: { flipFeeVa: number; flipFeeEwallet: number }): number {
    const ewallets = ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'];
    return ewallets.includes(bankCode.toLowerCase()) ? cfg.flipFeeEwallet : cfg.flipFeeVa;
  }

  @Get('wallet')
  async wallet(@CurrentUser() user: AuthenticatedUser) {
    const cfg = await this.getCfg();
    const rows = await this.prisma.$queryRaw<{ credit_in: number | null; credit_out: number | null }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN account_type IN ('refund_credit', 'topup', 'earnings') AND status = 'CLEARED' THEN amount ELSE 0 END), 0) AS credit_in,
        COALESCE(SUM(CASE WHEN account_type IN ('credit_use', 'withdrawal', 'admin_debit') AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS credit_out
      FROM wallet_ledger_entries
      WHERE user_id = ${user.id}::uuid
    `;
    const creditIn = Number(rows[0]?.credit_in ?? 0);
    const creditOut = Number(rows[0]?.credit_out ?? 0);
    const balance = creditIn - creditOut;

    const ledger = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, account_type AS "accountType", amount,
             reference_type AS "referenceType", reference_id AS "referenceId",
             status, description, created_at AS "createdAt", cleared_at AS "clearedAt"
        FROM wallet_ledger_entries
       WHERE user_id = ${user.id}::uuid
         AND account_type IN ('refund_credit', 'topup', 'earnings', 'credit_use', 'withdrawal', 'admin_debit')
       ORDER BY created_at DESC
       LIMIT 20
    `;

    const pendingRows = await this.prisma.$queryRaw<{ amount: number | null; count: number }[]>`
      SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*)::int AS count
        FROM withdrawals
       WHERE user_id = ${user.id}::uuid AND review_status = 'pending'
    `;

    return {
      balance,
      creditIn,
      creditOut,
      ledger,
      type: 'wallet',
      label: 'Saldo Wallet',
      withdrawable: true,
      minWithdrawal: cfg.minAmount,
      pendingWithdrawalAmount: Number(pendingRows[0]?.amount ?? 0),
      pendingWithdrawalCount: Number(pendingRows[0]?.count ?? 0),
      notice: 'Saldo dari refund & komisi referral. Bisa dipakai untuk pesanan atau ditarik ke rekening/e-wallet terverifikasi.',
    };
  }

  @Get('wallet/ledger')
  async ledger(@CurrentUser() user: AuthenticatedUser, @Query('limit') limitStr?: string, @Query('offset') offsetStr?: string) {
    const limit = Math.min(Number(limitStr ?? 50), 200);
    const offset = Math.max(Number(offsetStr ?? 0), 0);
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, account_type AS "accountType", amount,
             reference_type AS "referenceType", reference_id AS "referenceId",
             status, description, created_at AS "createdAt", cleared_at AS "clearedAt"
        FROM wallet_ledger_entries
       WHERE user_id = ${user.id}::uuid
         AND account_type IN ('refund_credit', 'topup', 'earnings', 'credit_use', 'withdrawal', 'admin_debit')
       ORDER BY created_at DESC
       LIMIT ${limit}::int OFFSET ${offset}::int
    `;
  }

  @Get('withdrawals')
  async withdrawals(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, amount, fee,
             destination_type AS "destType",
             destination_bank_code AS "bankCode",
             destination_account_number AS "accountNumber",
             destination_account_name AS "accountName",
             status, review_status AS "reviewStatus",
             review_note AS "reviewNote", failure_reason AS "failureReason",
             bank_transfer_ref AS "bankTransferRef",
             requested_at AS "requestedAt", completed_at AS "completedAt"
        FROM withdrawals
       WHERE user_id = ${user.id}::uuid
       ORDER BY requested_at DESC LIMIT 50
    `;
  }

  @Post('withdrawal/:id/sync')
  async syncWithdrawalStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<{ id: string; user_id: string; amount: number; status: string; flip_disbursement_id: string | null }[]>`
      SELECT id, user_id, amount, status, flip_disbursement_id
        FROM withdrawals WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid LIMIT 1
    `;
    const w = rows[0];
    if (!w) throw new NotFoundException('Withdrawal tidak ditemukan.');
    if (!w.flip_disbursement_id) return { ok: false, status: w.status, message: 'Belum ada Flip ID.' };
    if (w.status !== 'processing' && w.status !== 'pending') {
      return { ok: true, status: w.status, message: 'Status sudah final.' };
    }
    const result = await this.flip.getDisbursementStatus(w.flip_disbursement_id);
    if (!result) return { ok: false, status: w.status, message: 'Gagal cek status Flip. Coba lagi nanti.' };
    const statusRaw = String(result?.status ?? '').toUpperCase();
    const next = statusRaw === 'DONE' ? 'completed'
      : statusRaw === 'CANCELLED' ? 'canceled'
      : statusRaw === 'FAILED' ? 'failed'
      : null;
    if (!next) return { ok: true, status: w.status, message: `Flip masih ${statusRaw}.` };

    await this.prisma.$executeRaw`
      UPDATE withdrawals SET status = ${next}, callback_payload = ${JSON.stringify({ ...result, _source: 'manual-sync' })}::jsonb,
             processed_at = CASE WHEN ${next} = 'completed' THEN NOW() ELSE processed_at END
       WHERE id = ${w.id}::uuid AND status IN ('processing', 'pending')
    `;
    await this.prisma.$executeRaw`
      UPDATE wallet_ledger_entries SET status = 'CLEARED', cleared_at = NOW()
       WHERE reference_type = 'withdrawal' AND reference_id = ${w.id}::uuid AND status = 'PENDING'
    `;
    if (next === 'failed' || next === 'canceled') {
      await this.prisma.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
        VALUES (${w.user_id}::uuid, 'withdrawal', ${-w.amount}::bigint, 'withdrawal_reverse', ${w.id}::uuid, 'CLEARED', 'Reverse: manual sync ' || ${next})
      `;
    }
    return { ok: true, status: next };
  }

  @Post('withdrawal')
  async requestWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RequestWithdrawalSchema)) body: RequestWithdrawalDto,
  ) {
    const cfg = await this.getCfg();

    if (body.amount < cfg.minAmount) {
      throw new BadRequestException(`Minimum penarikan Rp ${cfg.minAmount.toLocaleString('id-ID')}.`);
    }

    if (cfg.cooldownHours > 0) {
      const last = await this.prisma.$queryRaw<{ requested_at: Date | null }[]>`
        SELECT requested_at FROM withdrawals
         WHERE user_id = ${user.id}::uuid AND status NOT IN ('rejected', 'failed', 'canceled')
         ORDER BY requested_at DESC LIMIT 1
      `;
      if (last[0]?.requested_at) {
        const hoursAgo = (Date.now() - new Date(last[0].requested_at).getTime()) / 3600_000;
        if (hoursAgo < cfg.cooldownHours) {
          const remaining = Math.ceil(cfg.cooldownHours - hoursAgo);
          throw new BadRequestException(`Tunggu ${remaining} jam lagi sebelum bisa request penarikan lagi.`);
        }
      }
    }

    if (cfg.maxDaily > 0) {
      const todaySum = await this.prisma.$queryRaw<{ total: number | null }[]>`
        SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM withdrawals
         WHERE user_id = ${user.id}::uuid
           AND requested_at >= (NOW() AT TIME ZONE 'Asia/Jakarta')::date
           AND status NOT IN ('rejected', 'failed', 'canceled')
      `;
      const usedToday = Number(todaySum[0]?.total ?? 0);
      if (usedToday + body.amount > cfg.maxDaily) {
        throw new BadRequestException(`Total penarikan harian maks Rp ${cfg.maxDaily.toLocaleString('id-ID')}. Sudah Rp ${usedToday.toLocaleString('id-ID')} hari ini.`);
      }
    }

    const txResult = await this.prisma.$transaction(async (tx) => {
      const bal = await tx.$queryRaw<{ credit_in: number | null; credit_out: number | null }[]>`
        SELECT
          COALESCE(SUM(CASE WHEN account_type IN ('refund_credit', 'topup', 'earnings') AND status = 'CLEARED' THEN amount ELSE 0 END), 0) AS credit_in,
          COALESCE(SUM(CASE WHEN account_type IN ('credit_use', 'withdrawal', 'admin_debit') AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS credit_out
        FROM wallet_ledger_entries WHERE user_id = ${user.id}::uuid
      `;
      const creditIn = Number(bal[0]?.credit_in ?? 0);
      const creditOut = Number(bal[0]?.credit_out ?? 0);
      const balance = creditIn - creditOut;
      if (balance < body.amount) {
        throw new BadRequestException(`Saldo tidak cukup. Saldo tersedia: Rp ${balance.toLocaleString('id-ID')}.`);
      }

      const ba = await tx.$queryRaw<{
        id: string;
        bank_code: string;
        account_number: string;
        account_holder_name: string;
        is_verified: boolean;
      }[]>`
        SELECT id, bank_code, account_number, account_holder_name, is_verified
          FROM customer_bank_accounts WHERE id = ${body.bankAccountId}::uuid AND user_id = ${user.id}::uuid LIMIT 1
      `;
      if (!ba[0]) throw new BadRequestException('Rekening tidak ditemukan.');
      if (!ba[0].is_verified) throw new BadRequestException('Rekening belum terverifikasi.');

      const statusRows = await tx.$queryRaw<{ value: any }[]>`
        SELECT value FROM app_config WHERE key = 'payment.bank_status' LIMIT 1
      `;
      const bankStatuses: Record<string, { status: string }> = (statusRows[0]?.value ?? {}) as any;
      const bankStatus = bankStatuses[ba[0].bank_code]?.status;
      if (bankStatus === 'down') {
        throw new BadRequestException(
          `${ba[0].bank_code.toUpperCase()} sedang gangguan/maintenance. Pilih bank/e-wallet lain atau tunggu sampai normal.`,
        );
      }

      const pendingExists = await tx.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM withdrawals
         WHERE user_id = ${user.id}::uuid
           AND review_status = 'pending'
      `;
      if (Number(pendingExists[0]?.c ?? 0) > 0) {
        throw new BadRequestException('Masih ada penarikan yang menunggu diproses. Tunggu sampai selesai sebelum ajukan baru.');
      }

      const flipFee = this.getFlipFee(ba[0].bank_code, cfg);
      const transferAmount = body.amount;
      const minuteBucket = Math.floor(Date.now() / 60_000);
      const idempKey = `CWD-${user.id.slice(0, 8)}-${minuteBucket}`;
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO withdrawals (
          user_id, amount, fee, destination_type, destination_bank_code, destination_account_number,
          destination_account_name, status, review_status, customer_bank_account_id, flip_idempotency_key
        ) VALUES (
          ${user.id}::uuid, ${body.amount}::bigint, 0::bigint, 'bank', ${ba[0].bank_code}, ${ba[0].account_number},
          ${ba[0].account_holder_name}, 'pending', 'pending', ${ba[0].id}::uuid, ${idempKey}
        ) RETURNING id
      `;
      const id = inserted[0]!.id;

      await tx.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description, metadata)
        VALUES (
          ${user.id}::uuid, 'withdrawal', ${body.amount}::bigint, 'withdrawal', ${id}::uuid, 'PENDING',
          ${'Hold for customer withdrawal'},
          ${JSON.stringify({ feePayer: 'owner', flipFee, transferAmount })}::jsonb
        )
      `;

      return {
        id,
        bankCode: ba[0].bank_code,
        accountNumber: ba[0].account_number,
        accountHolderName: ba[0].account_holder_name,
        flipFee,
        transferAmount,
        idempotencyKey: idempKey,
      };
    });

    try {
      const result = await this.flip.createDisbursement({
        amount: txResult.transferAmount,
        bankCode: txResult.bankCode,
        accountNumber: txResult.accountNumber,
        accountHolderName: txResult.accountHolderName,
        remark: 'JasaBersih Bonus',
        idempotencyKey: txResult.idempotencyKey,
      });
      const flipId = String(result?.id ?? '');
      await this.prisma.$executeRaw`
        UPDATE withdrawals
           SET flip_disbursement_id = ${flipId},
               status = 'processing',
               review_status = 'auto_approved',
               reviewed_at = NOW()
         WHERE id = ${txResult.id}::uuid
      `;
      return { id: txResult.id, amount: body.amount, transferAmount: txResult.transferAmount, fee: 0, status: 'processing', autoDisburse: true, flipId };
    } catch (e: any) {
      await this.prisma.$executeRaw`
        UPDATE withdrawals
           SET status = 'failed',
               review_status = 'rejected',
               review_note = 'Auto-disburse Flip gagal',
               reviewed_at = NOW(),
               failure_reason = ${String(e?.message ?? 'Flip error')}
         WHERE id = ${txResult.id}::uuid
      `;
      await this.prisma.$executeRaw`
        UPDATE wallet_ledger_entries SET status = 'CLEARED', cleared_at = NOW()
         WHERE reference_type = 'withdrawal' AND reference_id = ${txResult.id}::uuid AND status = 'PENDING'
      `;
      await this.prisma.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
        VALUES (${user.id}::uuid, 'withdrawal', ${-body.amount}::bigint, 'withdrawal_reverse', ${txResult.id}::uuid, 'CLEARED', 'Reverse: auto-disburse failed')
      `;
      throw new BadRequestException(`Penarikan gagal diproses: ${e?.message ?? 'Coba lagi nanti'}`);
    }
  }
}
