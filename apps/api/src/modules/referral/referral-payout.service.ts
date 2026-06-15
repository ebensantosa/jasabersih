import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';

/**
 * Referral payout helper.
 *
 * NEW model (Jun 2026): referrer dapat 5% commission TIAP order completed dari
 * customer yg dia referensi (recurring), bukan one-time bonus saat first order.
 * Dipanggil tiap kali booking jadi 'completed' (admin, auto-complete cron,
 * cleaner self-complete).
 *
 * Idempotent: pakai reference_id = booking.id supaya kalau dipanggil 2x (e.g.
 * status flip back-forward), gak double-credit. Detection: existing
 * wallet_ledger_entries dgn (referrer, 'referral', booking.id).
 */
@Injectable()
export class ReferralPayoutService {
  private readonly log = new Logger(ReferralPayoutService.name);
  private readonly DEFAULT_PCT = 5;

  constructor(private readonly prisma: PrismaService) {}

  async payoutForCompletedBooking(bookingId: string): Promise<void> {
    try {
      const bookings = await this.prisma.$queryRaw<{ customer_id: string | null; total_amount: number | null; status: string }[]>`
        SELECT customer_id, total_amount, status FROM bookings WHERE id = ${bookingId}::uuid LIMIT 1
      `;
      const b = bookings[0];
      if (!b || b.status !== 'completed' || !b.customer_id) return;
      const totalAmount = Number(b.total_amount ?? 0);
      if (totalAmount <= 0) return;

      // Cari referrer
      const refRows = await this.prisma.$queryRaw<{ id: string; referrer_id: string }[]>`
        SELECT id, referrer_id FROM referrals
         WHERE referred_id = ${b.customer_id}::uuid AND referrer_id IS NOT NULL LIMIT 1
      `;
      const ref = refRows[0];
      if (!ref) return;

      // Cek admin config: enabled + pct override + min order
      const cfgRows = await this.prisma.$queryRaw<{ key: string; value: any }[]>`
        SELECT key, value FROM app_config WHERE key IN
          ('referral.enabled', 'referral.commission_pct', 'referral.min_order_amount')
      `;
      const enabled = cfgRows.find((c) => c.key === 'referral.enabled')?.value !== false;
      if (!enabled) return;
      const pct = Number(cfgRows.find((c) => c.key === 'referral.commission_pct')?.value ?? this.DEFAULT_PCT);
      const minOrder = Number(cfgRows.find((c) => c.key === 'referral.min_order_amount')?.value ?? 0);
      if (totalAmount < minOrder) return;

      // Idempotency: skip kalau udh pernah commission utk booking ini.
      const exists = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM wallet_ledger_entries
         WHERE user_id = ${ref.referrer_id}::uuid
           AND reference_type = 'referral'
           AND reference_id = ${bookingId}::uuid
      `;
      if (Number(exists[0]?.c ?? 0) > 0) return;

      const commission = Math.round(totalAmount * pct / 100);
      if (commission <= 0) return;

      await this.prisma.$transaction([
        this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${ref.referrer_id}::uuid, 'earnings', ${commission}::bigint, 'referral', ${bookingId}::uuid,
                  'CLEARED', NOW(), ${`Komisi referral ${pct}% dari order #${bookingId.slice(0, 8)}`})
        `,
        // Update aggregate counter di referral_codes (best-effort)
        this.prisma.$executeRaw`
          UPDATE referral_codes
             SET total_referrals = total_referrals + 1,
                 total_paid = total_paid + ${commission}::bigint
           WHERE user_id = ${ref.referrer_id}::uuid
        `,
        // Tetap update referral status -> 'active' supaya admin track kontribusi.
        this.prisma.$executeRaw`
          UPDATE referrals
             SET status = 'active',
                 qualified_at = COALESCE(qualified_at, NOW()),
                 bonus_amount = COALESCE(bonus_amount, 0) + ${commission}::bigint
           WHERE id = ${ref.id}::uuid
        `,
      ]);
      this.log.log(`Referral commission Rp${commission} -> user ${ref.referrer_id} (booking ${bookingId})`);
    } catch (e: any) {
      this.log.error(`Referral payout failed for booking ${bookingId}: ${e?.message}`);
    }
  }
}
