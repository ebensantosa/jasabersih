import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('customer-wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customer')
export class CustomerWalletController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /v1/customer/wallet — saldo refund-credit + history.
  // Saldo = SUM(refund_credit + topup CLEARED) - SUM(credit_use + withdrawal + admin_debit PENDING/CLEARED)
  // PENTING: admin_debit WAJIB ikut dikurangin biar saldo sync dgn admin view (sebelumnya bug — admin
  // kurangin saldo tapi customer view stale).
  @Get('wallet')
  async wallet(@CurrentUser() user: AuthenticatedUser) {
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

    return {
      balance,
      creditIn,
      creditOut,
      ledger,
      // Penanda kompliance: ini store credit, BUKAN e-money (gak butuh izin BI).
      type: 'store_credit',
      label: 'Saldo Wallet',
      withdrawable: false,
      notice: 'Saldo refund dan komisi referral masuk ke wallet ini. Saat ini saldo hanya bisa dipakai untuk booking berikutnya dan belum bisa ditarik tunai.',
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
}
