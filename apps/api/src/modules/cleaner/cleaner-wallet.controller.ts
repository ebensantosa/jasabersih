import { BadRequestException, Body, Controller, ForbiddenException, Get, Logger, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  private async getCfg(): Promise<{ minAmount: number; maxDaily: number; cooldownHours: number; autoApproveThreshold: number; feePayer: 'owner' | 'cleaner'; flipFeeVa: number; flipFeeEwallet: number }> {
    const rows = await this.prisma.$queryRaw<{ key: string; value: unknown }[]>`
      SELECT key, value FROM app_config WHERE key IN
        ('withdrawal.min_amount', 'withdrawal.max_daily', 'withdrawal.cooldown_hours',
         'withdrawal.auto_approve_threshold', 'withdrawal.fee_payer',
         'withdrawal.flip_fee_va', 'withdrawal.flip_fee_ewallet',
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
      // Default 0 = NO LIMIT. Admin bisa set di app_config 'withdrawal.max_daily'
      // utk batasin per hari. User minta: gak ada batas, fee ke cleaner (default).
      maxDaily: num('withdrawal.max_daily', 0),
      cooldownHours: num('withdrawal.cooldown_hours', 4),
      autoApproveThreshold: num('withdrawal.auto_approve_threshold', 2000000),
      feePayer: (str('withdrawal.fee_payer', 'cleaner') === 'cleaner' ? 'cleaner' : 'owner'),
      flipFeeVa: num('withdrawal.flip_fee_va', 2500),
      flipFeeEwallet: num('withdrawal.flip_fee_ewallet', 4000),
    };
  }

  // Helper: fee Flip berdasarkan bank/wallet code
  private getFlipFee(bankCode: string, cfg: { flipFeeVa: number; flipFeeEwallet: number }): number {
    const ewallets = ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'];
    return ewallets.includes(bankCode.toLowerCase()) ? cfg.flipFeeEwallet : cfg.flipFeeVa;
  }

  // GET /v1/cleaner/wallet — saldo + ledger 20 entry terakhir
  @Get('wallet')
  async wallet(@CurrentUser() user: AuthenticatedUser) {
    const balanceRows = await this.prisma.$queryRaw<{ earnings_cleared: number | null; earnings_pending: number | null; withdrawn: number | null; admin_debited: number | null }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN account_type = 'earnings' AND status = 'CLEARED' THEN amount ELSE 0 END), 0) AS earnings_cleared,
        COALESCE(SUM(CASE WHEN account_type = 'earnings' AND status = 'PENDING' THEN amount ELSE 0 END), 0) AS earnings_pending,
        COALESCE(SUM(CASE WHEN account_type = 'withdrawal' AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS withdrawn,
        COALESCE(SUM(CASE WHEN account_type = 'admin_debit' AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS admin_debited
      FROM wallet_ledger_entries
      WHERE user_id = ${user.id}::uuid
    `;
    const earningsCleared = Number(balanceRows[0]?.earnings_cleared ?? 0);
    const earningsPending = Number(balanceRows[0]?.earnings_pending ?? 0);
    const withdrawn = Number(balanceRows[0]?.withdrawn ?? 0);
    const adminDebited = Number(balanceRows[0]?.admin_debited ?? 0);
    const balance = earningsCleared - withdrawn - adminDebited; // saldo cair-able
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

    // Tip insights: total tip bulan ini + bulan lalu + count
    const tipRows = await this.prisma.$queryRaw<{ month_total: number; month_count: number; prev_total: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN reference_type = 'tip' AND date_trunc('month', created_at) = date_trunc('month', NOW()) THEN amount ELSE 0 END), 0)::bigint AS month_total,
        COUNT(CASE WHEN reference_type = 'tip' AND date_trunc('month', created_at) = date_trunc('month', NOW()) THEN 1 END)::int AS month_count,
        COALESCE(SUM(CASE WHEN reference_type = 'tip' AND date_trunc('month', created_at) = date_trunc('month', NOW() - INTERVAL '1 month') THEN amount ELSE 0 END), 0)::bigint AS prev_total
      FROM wallet_ledger_entries
      WHERE user_id = ${user.id}::uuid AND account_type = 'earnings'
    `;

    return {
      balance,
      earnings,
      earningsPending, // escrow 24h yang belum cair
      withdrawn,
      pendingWithdrawalAmount: Number(pendingRows[0]?.amount ?? 0),
      pendingWithdrawalCount: Number(pendingRows[0]?.count ?? 0),
      tipInsights: {
        monthTotal: Number(tipRows[0]?.month_total ?? 0),
        monthCount: Number(tipRows[0]?.month_count ?? 0),
        prevMonthTotal: Number(tipRows[0]?.prev_total ?? 0),
      },
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

  // Manual sync status withdrawal langsung dari Flip - dipake mobile sebagai
  // pull-to-refresh. Polling juga jalan via cron tiap 5 menit, ini supaya
  // user gak nunggu cron + dapat status segera.
  @Post('withdrawal/:id/sync')
  async syncWithdrawalStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<{ id: string; user_id: string; amount: number; status: string; flip_disbursement_id: string | null }[]>`
      SELECT id, user_id, amount, status, flip_disbursement_id
        FROM withdrawals WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid LIMIT 1
    `;
    const w = rows[0];
    if (!w) throw new NotFoundException('Withdrawal tidak ditemukan.');
    if (!w.flip_disbursement_id) return { ok: false, status: w.status, message: 'Belum ada Flip ID (masih pending review admin).' };
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
    // Update + clear hold (atomic via WHERE clause supaya gak race dgn webhook/cron)
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

    // BLOCK kalau ada dispute open/under_review yg melibatkan cleaner ini.
    // Cleaner gak boleh tarik selama sengketa belum selesai (anti payout
    // pre-judgment). Cek booking_id yg cleaner-nya = user atau dispute
    // raised_by/subject_user_id = user.
    const openDisputes = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM disputes d
       LEFT JOIN bookings b ON b.id = d.booking_id
       WHERE d.status IN ('open', 'under_review', 'pending')
         AND (b.cleaner_id = ${user.id}::uuid
              OR d.raised_by = ${user.id}::uuid
              OR d.subject_user_id = ${user.id}::uuid)
    `;
    if (Number(openDisputes[0]?.c ?? 0) > 0) {
      throw new ForbiddenException('Ada sengketa aktif yg melibatkan kamu. Selesaikan dulu sebelum tarik dana.');
    }

    // KYC + saldo (di dalam tx supaya consistent)
    const txResult = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.$queryRaw<{ kyc_status: string | null }[]>`SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1`;
      if (profile[0]?.kyc_status !== 'approved') {
        throw new ForbiddenException('KYC belum disetujui. Selesaikan verifikasi dulu.');
      }

      // PENTING: cuma earnings dengan status='CLEARED' yang bisa ditarik.
      // PENDING earnings = masih escrow 24h / nunggu customer confirm.
      const bal = await tx.$queryRaw<{ available: number | null; pending: number | null; withdrawn: number | null; admin_debited: number | null }[]>`
        SELECT
          COALESCE(SUM(CASE WHEN account_type = 'earnings' AND status = 'CLEARED' THEN amount ELSE 0 END), 0) AS available,
          COALESCE(SUM(CASE WHEN account_type = 'earnings' AND status = 'PENDING' THEN amount ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN account_type = 'withdrawal' AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS withdrawn,
          COALESCE(SUM(CASE WHEN account_type = 'admin_debit' AND status IN ('PENDING', 'CLEARED') THEN amount ELSE 0 END), 0) AS admin_debited
        FROM wallet_ledger_entries WHERE user_id = ${user.id}::uuid
      `;
      const available = Number(bal[0]?.available ?? 0);
      const pending = Number(bal[0]?.pending ?? 0);
      const withdrawn = Number(bal[0]?.withdrawn ?? 0);
      const adminDebited = Number(bal[0]?.admin_debited ?? 0);
      const balance = available - withdrawn - adminDebited; // yang siap dicairkan

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

      // SAFEGUARD bank gangguan: refuse withdrawal kalau bank/wallet tujuan
      // sedang DOWN. Status di-update otomatis dari Flip webhook ke
      // app_config 'payment.bank_status'. Cek per bank code.
      // (delayed masih boleh, transfer mungkin lambat tapi akan sukses)
      const statusRows = await tx.$queryRaw<{ value: any }[]>`
        SELECT value FROM app_config WHERE key = 'payment.bank_status' LIMIT 1
      `;
      const bankStatuses: Record<string, { status: string }> = (statusRows[0]?.value ?? {}) as any;
      const bankStatus = bankStatuses[bankCode]?.status;
      if (bankStatus === 'down') {
        throw new BadRequestException(
          `${bankCode.toUpperCase()} sedang gangguan/maintenance. Transfer akan gagal. Pilih bank/e-wallet lain atau tunggu sampai normal.`,
        );
      }

      // Hitung fee Flip + amount yang ke cleaner
      const flipFee = this.getFlipFee(bankCode, cfg);
      const transferAmount = cfg.feePayer === 'cleaner' ? body.amount - flipFee : body.amount;
      if (cfg.feePayer === 'cleaner' && transferAmount < 10000) {
        throw new BadRequestException(`Setelah dipotong fee transfer Rp ${flipFee.toLocaleString('id-ID')}, sisa Rp ${transferAmount.toLocaleString('id-ID')} di bawah minimum transfer (Rp 10.000). Tambah jumlah penarikan.`);
      }

      // Pre-check: tolak kalau cleaner punya withdrawal pending (anti double-tap + anti race).
      const pendingExists = await tx.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM withdrawals
         WHERE user_id = ${user.id}::uuid
           AND review_status = 'pending'
      `;
      if (Number(pendingExists[0]?.c ?? 0) > 0) {
        throw new BadRequestException('Kamu masih punya pengajuan tarik dana yang menunggu diproses. Tunggu sampai selesai sebelum ajukan baru.');
      }
      // Idempotency key window 1 menit per user (kalau client double-tap < 60s, key sama → unique violation)
      const minuteBucket = Math.floor(Date.now() / 60_000);
      const idempKey = `WD-${user.id.slice(0, 8)}-${minuteBucket}`;
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO withdrawals (
          user_id, amount, fee, destination_type, destination_bank_code, destination_account_number,
          destination_account_name, status, review_status, bank_account_id, flip_idempotency_key
        ) VALUES (
          ${user.id}::uuid, ${body.amount}::bigint, ${cfg.feePayer === 'cleaner' ? flipFee : 0}::bigint, 'bank', ${bankCode}, ${accountNumber},
          ${accountName}, 'pending', 'pending', ${bankAccountId}::uuid, ${idempKey}
        ) RETURNING id
      `;
      const id = inserted[0]!.id;

      // Hold saldo full body.amount (termasuk fee kalau cleaner yang bayar)
      await tx.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description, metadata)
        VALUES (
          ${user.id}::uuid, 'withdrawal', ${body.amount}::bigint, 'withdrawal', ${id}::uuid, 'PENDING',
          ${cfg.feePayer === 'cleaner' ? `Hold ${body.amount} (transfer ${transferAmount} + fee ${flipFee})` : 'Hold for withdrawal request'},
          ${JSON.stringify({ feePayer: cfg.feePayer, flipFee, transferAmount })}::jsonb
        )
      `;
      return { id, transferAmount, flipFee };
    });
    const wid = txResult.id;
    const transferAmount = txResult.transferAmount;
    const flipFee = txResult.flipFee;

    // Auto-disburse kalau bank account verified (di luar tx — Flip API call bisa lama).
    // Threshold limit dihapus — semua nominal langsung release ke Flip selama
    // udh lolos dispute check + ada bank verified. Fallback manual admin tetap
    // ada kalau Flip API error (status='pending_review').
    const eligible = !!body.bankAccountId;
    if (eligible) {
      try {
        const ba = await this.prisma.$queryRaw<{ bank_code: string; account_number: string; account_holder_name: string }[]>`
          SELECT bank_code, account_number, account_holder_name FROM cleaner_bank_accounts WHERE id = ${body.bankAccountId!}::uuid
        `;
        const wd = await this.prisma.$queryRaw<{ flip_idempotency_key: string }[]>`
          SELECT flip_idempotency_key FROM withdrawals WHERE id = ${wid}::uuid
        `;
        const result = await this.flip.createDisbursement({
          amount: transferAmount,
          bankCode: ba[0]!.bank_code,
          accountNumber: ba[0]!.account_number,
          accountHolderName: ba[0]!.account_holder_name,
          // Flip limit remark max 18 char. 'JasaBersih withdrawal' (21) = reject.
          remark: 'JasaBersih Tarik',
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
        return { id: wid, amount: body.amount, transferAmount, fee: flipFee, status: 'processing', autoDisburse: true, flipId };
      } catch (e: any) {
        this.log.error(`Auto-disburse failed for withdrawal ${wid}: ${e?.message ?? e}`);
        // Mark as failed + reverse hold. PENTING: juga update review_status
        // dari 'pending' -> 'rejected', kalau enggak, blocker check di endpoint
        // 'pending withdrawal exists' bakal tetap trigger -> user gak bisa
        // submit baru sampai admin manual update.
        await this.prisma.$executeRaw`
          UPDATE withdrawals
             SET status = 'failed',
                 review_status = 'rejected',
                 review_note = 'Auto-disburse Flip gagal',
                 reviewed_at = NOW(),
                 failure_reason = ${String(e?.message ?? 'Flip error')}
           WHERE id = ${wid}::uuid
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

    return { id: wid, amount: body.amount, transferAmount, fee: flipFee, status: 'pending', autoDisburse: false, message: 'Penarikan menunggu approval admin (jumlah di atas threshold auto-approve).' };
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
