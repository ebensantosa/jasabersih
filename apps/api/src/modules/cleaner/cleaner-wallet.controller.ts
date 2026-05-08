import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const RequestWithdrawalSchema = z.object({
  amount: z.number().int().positive(),
  bankCode: z.string().min(1).max(20),
  accountNumber: z.string().min(5).max(50),
  accountName: z.string().min(1).max(255),
});
type RequestWithdrawalDto = z.infer<typeof RequestWithdrawalSchema>;

@ApiTags('cleaner-wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cleaner')
export class CleanerWalletController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /v1/cleaner/wallet — saldo + ledger 20 entry terakhir
  @Get('wallet')
  async wallet(@CurrentUser() user: AuthenticatedUser) {
    const balanceRows = await this.prisma.$queryRaw<{ earnings: number | null; withdrawn: number | null }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN account_type = 'earnings' THEN amount ELSE 0 END), 0) AS earnings,
        COALESCE(SUM(CASE WHEN account_type = 'withdrawal' AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS withdrawn
      FROM wallet_ledger_entries
      WHERE user_id = ${user.id}::uuid
    `;
    const earnings = Number(balanceRows[0]?.earnings ?? 0);
    const withdrawn = Number(balanceRows[0]?.withdrawn ?? 0);
    const balance = earnings - withdrawn;

    const ledger = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, account_type AS "accountType", amount,
             reference_type AS "referenceType", reference_id AS "referenceId",
             status, description, metadata,
             created_at AS "createdAt", cleared_at AS "clearedAt"
        FROM wallet_ledger_entries
       WHERE user_id = ${user.id}::uuid
       ORDER BY created_at DESC
       LIMIT 20
    `;

    // Pending withdrawal (di-hold sampai admin approve)
    const pendingRows = await this.prisma.$queryRaw<{ amount: number | null; count: number }[]>`
      SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*)::int AS count
        FROM withdrawals
       WHERE user_id = ${user.id}::uuid AND review_status = 'pending'
    `;

    return {
      balance,
      earnings,
      withdrawn,
      pendingWithdrawalAmount: Number(pendingRows[0]?.amount ?? 0),
      pendingWithdrawalCount: Number(pendingRows[0]?.count ?? 0),
      ledger,
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
       ORDER BY created_at DESC
       LIMIT ${limit}::int OFFSET ${offset}::int
    `;
  }

  @Get('withdrawals')
  async withdrawals(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, amount, fee,
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

  // POST /v1/cleaner/withdrawal — minta tarik
  @Post('withdrawal')
  async requestWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RequestWithdrawalSchema)) body: RequestWithdrawalDto,
  ) {
    // Min withdrawal dari app_config (default 50000)
    const cfgRows = await this.prisma.$queryRaw<{ value: unknown }[]>`SELECT value FROM app_config WHERE key = 'feature.min_withdrawal' LIMIT 1`;
    const minAmount = Number((cfgRows[0]?.value as any) ?? 50000);
    if (body.amount < minAmount) {
      throw new BadRequestException(`Minimum penarikan Rp ${minAmount.toLocaleString('id-ID')}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Cek saldo cukup (recompute di dalam transaction)
      const bal = await tx.$queryRaw<{ earnings: number | null; withdrawn: number | null }[]>`
        SELECT
          COALESCE(SUM(CASE WHEN account_type = 'earnings' THEN amount ELSE 0 END), 0) AS earnings,
          COALESCE(SUM(CASE WHEN account_type = 'withdrawal' AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS withdrawn
        FROM wallet_ledger_entries WHERE user_id = ${user.id}::uuid
      `;
      const balance = Number(bal[0]?.earnings ?? 0) - Number(bal[0]?.withdrawn ?? 0);
      if (balance < body.amount) {
        throw new ForbiddenException(`Saldo tidak cukup. Saldo: Rp ${balance.toLocaleString('id-ID')}.`);
      }

      // KYC harus approved
      const profile = await tx.$queryRaw<{ kyc_status: string | null }[]>`SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1`;
      if (profile[0]?.kyc_status !== 'approved') {
        throw new ForbiddenException('KYC kamu belum disetujui. Selesaikan verifikasi dulu.');
      }

      // Create withdrawal record
      const wdRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO withdrawals (user_id, amount, destination_type, destination_bank_code, destination_account_number, destination_account_name, status, review_status)
        VALUES (${user.id}::uuid, ${body.amount}::bigint, 'bank', ${body.bankCode}, ${body.accountNumber}, ${body.accountName}, 'pending', 'pending')
        RETURNING id
      `;
      const wid = wdRows[0]!.id;

      // Hold saldo via ledger debit (status=PENDING; nanti CLEARED saat admin approve, atau di-reverse saat reject)
      await tx.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
        VALUES (${user.id}::uuid, 'withdrawal', ${body.amount}::bigint, 'withdrawal', ${wid}::uuid, 'PENDING', 'Hold for withdrawal request')
      `;

      return { id: wid, amount: body.amount, status: 'pending' };
    });
  }
}
