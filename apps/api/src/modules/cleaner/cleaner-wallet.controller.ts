import { BadRequestException, Body, Controller, ForbiddenException, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { FlipService } from '../payments/flip.service';

const RequestWithdrawalSchema = z.object({
  amount: z.number().int().positive(),
  // Legacy fields — backward compat untuk old mobile clients
  bankCode: z.string().min(1).max(20).optional(),
  accountNumber: z.string().min(5).max(50).optional(),
  accountName: z.string().min(1).max(255).optional(),
  // New flow — required untuk auto-disburse
  bankAccountId: z.string().uuid().optional(),
});
type RequestWithdrawalDto = z.infer<typeof RequestWithdrawalSchema>;

@ApiTags('cleaner-wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cleaner')
export class CleanerWalletController {
  private readonly log = new Logger(CleanerWalletController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flip: FlipService,
  ) {}

  private async getCfg(): Promise<{ minAmount: number; maxDaily: number; cooldownHours: number; autoApproveThreshold: number; feePayer: 'owner' | 'cleaner' }> {
    const rows = await this.prisma.$queryRaw<{ key: string; value: unknown }[]>`
      SELECT key, value FROM app_config WHERE key IN
        ('withdrawal.min_amount', 'withdrawal.max_daily', 'withdrawal.cooldown_hours',
         'withdrawal.auto_approve_threshold', 'withdrawal.fee_payer',
         'cleaner.withdraw_min_amount', 'cleaner.withdraw_max_per_day', 'feature.min_withdrawal')
    `;
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const num = (k: string, fallback: number): number => {
      const v = m.get(k); if (v == null) return fallback;
      const n = Number(typeof v === 'string' ? (v as string).replace(/"/g, '') : v);
      return Number.isFinite(n) ? n : fallback;
    };
    const str = (k: string, fallback: string): string => {
      const v = m.get(k); if (v == null) return fallback;
      return typeof v === 'string' ? (v as string).replace(/"/g, '') : String(v);
    };
    return {
      minAmount: num('withdrawal.min_amount', num('cleaner.withdraw_min_amount', num('feature.min_withdrawal', 50000))),
      maxDaily: num('withdrawal.max_daily', 2000000),
      cooldownHours: num('withdrawal.cooldown_hours', 4),
      autoApproveThreshold: num('withdrawal.auto_approve_threshold', 500000),
      feePayer: (str('withdrawal.fee_payer', 'owner') === 'cleaner' ? 'cleaner' : 'owner'),
    };
  }

  // GET /v1/cleaner/wallet — saldo + ledger 20 entry terakhir
  @Get('wallet')
  async wallet(@CurrentUser() user: AuthenticatedUser) {
    const balanceRows = await this.prisma.$queryRaw<{ earnings_cleared: number | null; earnings_pending: number | null; withdrawn: number | null }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN account_type = 'earnings' AND status = 'CLEARED' THEN amount ELSE 0 END), 0) AS earnings_cleared,
        COALESCE(SUM(CASE WHEN account_type = 'earnings' AND status = 'PENDING' THEN amount ELSE 0 END), 0) AS earnings_pending,
        COALESCE(SUM(CASE WHEN account_type = 'withdrawal' AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS withdrawn
      FROM wallet_ledger_entries
      WHERE user_id = ${user.id}::uuid
    `;
    const earningsCleared = Number(balanceRows[0]?.earnings_cleared ?? 0);
    const earningsPending = Number(balanceRows[0]?.earnings_pending ?? 0);
    const withdrawn = Number(balanceRows[0]?.withdrawn ?? 0);
    const balance = earningsCleared - withdrawn; // saldo cair-able
    const earnings = earningsCleared + earningsPending; // total all-time (untuk back-compat)

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
      earningsPending, // escrow 24h yang belum cair
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

  // POST /v1/cleaner/withdrawal — request penarikan
  // Behavior:
  // - Kalau `bankAccountId` provided & amount <= autoApproveThreshold → auto-disburse via Flip
  // - Kalau gak ada bank_account_id atau amount > threshold → masuk antrian admin manual approve (legacy)
  @Post('withdrawal')
  async requestWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RequestWithdrawalSchema)) body: RequestWithdrawalDto,
  ) {
    const cfg = await this.getCfg();

    if (body.amount < cfg.minAmount) {
      throw new BadRequestException(`Minimum penarikan Rp ${cfg.minAmount.toLocaleString('id-ID')}.`);
    }

    // Cooldown: cek withdrawal terakhir dalam X jam
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

    // Max harian (Rupiah, bukan jumlah)
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

    // KYC + saldo (di dalam tx supaya consistent)
    const wid = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.$queryRaw<{ kyc_status: string | null }[]>`SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1`;
      if (profile[0]?.kyc_status !== 'approved') {
        throw new ForbiddenException('KYC belum disetujui. Selesaikan verifikasi dulu.');
      }

      // PENTING: cuma earnings dengan status='CLEARED' yang bisa ditarik.
      // PENDING earnings = masih escrow 24h / nunggu customer confirm.
      const bal = await tx.$queryRaw<{ available: number | null; pending: number | null; withdrawn: number | null }[]>`
        SELECT
          COALESCE(SUM(CASE WHEN account_type = 'earnings' AND status = 'CLEARED' THEN amount ELSE 0 END), 0) AS available,
          COALESCE(SUM(CASE WHEN account_type = 'earnings' AND status = 'PENDING' THEN amount ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN account_type = 'withdrawal' AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS withdrawn
        FROM wallet_ledger_entries WHERE user_id = ${user.id}::uuid
      `;
      const available = Number(bal[0]?.available ?? 0);
      const pending = Number(bal[0]?.pending ?? 0);
      const withdrawn = Number(bal[0]?.withdrawn ?? 0);
      const balance = available - withdrawn; // yang siap dicairkan

      if (balance < body.amount) {
        const msg = pending > 0
          ? `Saldo siap tarik: Rp ${balance.toLocaleString('id-ID')}. Rp ${pending.toLocaleString('id-ID')} masih menunggu konfirmasi customer / 24 jam.`
          : `Saldo tidak cukup. Saldo siap tarik: Rp ${balance.toLocaleString('id-ID')}.`;
        throw new ForbiddenException(msg);
      }

      // Resolve bank info — prefer bankAccountId (verified), fallback ke inline (legacy)
      let bankCode = body.bankCode ?? '';
      let accountNumber = body.accountNumber ?? '';
      let accountName = body.accountName ?? '';
      let bankAccountId: string | null = null;
      if (body.bankAccountId) {
        const ba = await tx.$queryRaw<{ id: string; bank_code: string; account_number: string; account_holder_name: string; is_verified: boolean }[]>`
          SELECT id, bank_code, account_number, account_holder_name, is_verified
            FROM cleaner_bank_accounts WHERE id = ${body.bankAccountId}::uuid AND user_id = ${user.id}::uuid LIMIT 1
        `;
        if (!ba[0]) throw new BadRequestException('Rekening tidak ditemukan.');
        if (!ba[0].is_verified) throw new BadRequestException('Rekening belum terverifikasi.');
        bankAccountId = ba[0].id;
        bankCode = ba[0].bank_code;
        accountNumber = ba[0].account_number;
        accountName = ba[0].account_holder_name;
      }
      if (!bankCode || !accountNumber || !accountName) {
        throw new BadRequestException('Info rekening tidak lengkap. Tambah/pilih rekening terverifikasi.');
      }

      const idempKey = `WD-${user.id.slice(0, 8)}-${Date.now()}`;
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO withdrawals (
          user_id, amount, destination_type, destination_bank_code, destination_account_number,
          destination_account_name, status, review_status, bank_account_id, flip_idempotency_key
        ) VALUES (
          ${user.id}::uuid, ${body.amount}::bigint, 'bank', ${bankCode}, ${accountNumber},
          ${accountName}, 'pending', 'pending', ${bankAccountId}::uuid, ${idempKey}
        ) RETURNING id
      `;
      const id = inserted[0]!.id;

      // Hold saldo (PENDING ledger entry)
      await tx.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
        VALUES (${user.id}::uuid, 'withdrawal', ${body.amount}::bigint, 'withdrawal', ${id}::uuid, 'PENDING', 'Hold for withdrawal request')
      `;
      return id;
    });

    // Auto-disburse kalau eligible (di luar tx — Flip API call bisa lama)
    const eligible = !!body.bankAccountId && body.amount <= cfg.autoApproveThreshold;
    if (eligible) {
      try {
        const ba = await this.prisma.$queryRaw<{ bank_code: string; account_number: string; account_holder_name: string }[]>`
          SELECT bank_code, account_number, account_holder_name FROM cleaner_bank_accounts WHERE id = ${body.bankAccountId!}::uuid
        `;
        const wd = await this.prisma.$queryRaw<{ flip_idempotency_key: string }[]>`
          SELECT flip_idempotency_key FROM withdrawals WHERE id = ${wid}::uuid
        `;
        const result = await this.flip.createDisbursement({
          amount: body.amount,
          bankCode: ba[0]!.bank_code,
          accountNumber: ba[0]!.account_number,
          accountHolderName: ba[0]!.account_holder_name,
          remark: 'JasaBersih withdrawal',
          idempotencyKey: wd[0]!.flip_idempotency_key,
        });
        const flipId = String(result?.id ?? '');
        await this.prisma.$executeRaw`
          UPDATE withdrawals
             SET flip_disbursement_id = ${flipId},
                 status = 'processing',
                 review_status = 'auto_approved',
                 reviewed_at = NOW()
           WHERE id = ${wid}::uuid
        `;
        return { id: wid, amount: body.amount, status: 'processing', autoDisburse: true, flipId };
      } catch (e: any) {
        this.log.error(`Auto-disburse failed for withdrawal ${wid}: ${e?.message ?? e}`);
        // Mark as failed + reverse hold
        await this.prisma.$executeRaw`
          UPDATE withdrawals SET status = 'failed', failure_reason = ${String(e?.message ?? 'Flip error')} WHERE id = ${wid}::uuid
        `;
        await this.prisma.$executeRaw`
          UPDATE wallet_ledger_entries SET status = 'CLEARED', cleared_at = NOW()
           WHERE reference_type = 'withdrawal' AND reference_id = ${wid}::uuid AND status = 'PENDING'
        `;
        await this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
          VALUES (${user.id}::uuid, 'withdrawal', ${-body.amount}::bigint, 'withdrawal_reverse', ${wid}::uuid, 'CLEARED', 'Reverse: auto-disburse failed')
        `;
        throw new BadRequestException(`Penarikan gagal diproses: ${e?.message ?? 'Coba lagi nanti'}`);
      }
    }

    return { id: wid, amount: body.amount, status: 'pending', autoDisburse: false, message: 'Penarikan menunggu approval admin (jumlah di atas threshold auto-approve).' };
  }

  // GET /v1/cleaner/leaderboard?month=YYYY-MM — top 5 cleaner bulan ini + posisi user
  @Get('leaderboard')
  async leaderboard(@CurrentUser() user: AuthenticatedUser, @Query('month') month?: string) {
    // Default: bulan berjalan. Format expected: YYYY-MM
    const ref = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null;
    const monthStart = ref ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const rows = await this.prisma.$queryRaw<{ userId: string; name: string | null; city: string | null; jobs: number; earnings: number }[]>`
      WITH monthly AS (
        SELECT b.cleaner_id AS user_id,
               COUNT(*)::int AS jobs,
               COALESCE(SUM(b.cleaner_payout), 0)::bigint AS earnings
          FROM bookings b
         WHERE b.status = 'completed'
           AND b.cleaner_id IS NOT NULL
           AND b.completed_at >= ${monthStart}::date
           AND b.completed_at < (${monthStart}::date + INTERVAL '1 month')
         GROUP BY b.cleaner_id
      )
      SELECT m.user_id AS "userId",
             u.name,
             COALESCE(cp.service_areas->>0, NULL) AS city,
             m.jobs,
             m.earnings::int AS earnings,
             RANK() OVER (ORDER BY m.jobs DESC, m.earnings DESC) AS rnk
        FROM monthly m
        JOIN users u ON u.id = m.user_id
        LEFT JOIN cleaner_profiles cp ON cp.user_id = m.user_id
       ORDER BY rnk ASC
    `;

    const top = rows.slice(0, 5).map((r) => ({
      name: r.name ?? 'Cleaner',
      city: r.city ?? null,
      jobs: Number(r.jobs),
    }));

    const me = rows.find((r) => r.userId === user.id);
    const meRank = me ? rows.findIndex((r) => r.userId === user.id) + 1 : null;

    return {
      month: monthStart.slice(0, 7),
      top,
      me: me
        ? { rank: meRank, jobs: Number(me.jobs), earnings: Number(me.earnings) }
        : { rank: null, jobs: 0, earnings: 0 },
    };
  }
}
