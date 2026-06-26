import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';
import { ReferralPayoutService } from '../referral/referral-payout.service';

// Auto-complete hanya untuk job non-hourly yang benar-benar stale.
// Job per jam harus selesai manual karena durasinya sekarang ditracking oleh timer.
const STALE_HOURS = 4;

@Injectable()
export class AutoCompleteService {
  private readonly log = new Logger(AutoCompleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly referralPayout: ReferralPayoutService,
  ) {}

  @Cron('*/2 * * * *')
  async autoCompleteExpiredHourly(): Promise<void> {
    const expired = await this.prisma.$queryRaw<{ id: string; customer_id: string | null; cleaner_id: string | null; cleaner_payout: number | null }[]>`
      SELECT id, customer_id, cleaner_id, cleaner_payout
        FROM bookings
       WHERE status = 'in_progress'
         AND pricing_mode = 'hourly'
         AND started_at IS NOT NULL
         AND hours_booked IS NOT NULL
         AND pause_started_at IS NULL
         AND started_at + (hours_booked::numeric * 3600 - COALESCE(paused_total_sec, 0))::int * INTERVAL '1 second' < NOW() - INTERVAL '1 minute'
    `;
    if (expired.length === 0) return;
    this.log.log(`Auto-complete hourly expired: ${expired.length} booking(s)`);

    for (const b of expired) {
      try {
        await this.prisma.$transaction([
          this.prisma.$executeRaw`
            UPDATE bookings
               SET status = 'completed', completed_at = NOW(),
                   admin_notes = COALESCE(admin_notes, '') || E'\n[auto] hourly timer expired'
             WHERE id = ${b.id}::uuid AND status = 'in_progress'
          `,
          ...(b.cleaner_id && Number(b.cleaner_payout ?? 0) > 0 ? [
            this.prisma.$executeRaw`
              INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
              VALUES (${b.cleaner_id}::uuid, 'earnings', ${b.cleaner_payout}::bigint, 'booking', ${b.id}::uuid, 'PENDING', NULL, 'Earning auto-complete hourly — escrow 24 jam')
              ON CONFLICT DO NOTHING
            `,
          ] : []),
        ]);
        if (b.customer_id) {
          void this.push.send({
            userId: b.customer_id, channel: 'booking',
            title: 'Waktu kerja selesai',
            body: 'Durasi booking per jam sudah habis. Yuk kasih rating untuk cleanermu!',
            data: { type: 'hourly_timer_expired', bookingId: b.id },
          }).catch(() => {});
        }
        if (b.cleaner_id) {
          void this.push.send({
            userId: b.cleaner_id, channel: 'booking',
            title: 'Timer habis',
            body: 'Durasi kerja sudah selesai. Jangan lupa foto after dan selesaikan booking.',
            data: { type: 'hourly_timer_expired', bookingId: b.id },
          }).catch(() => {});
        }
        await this.referralPayout.payoutForCompletedBooking(b.id);
      } catch (e) {
        this.log.error(`Auto-complete hourly failed for booking ${b.id}: ${e}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async autoCompleteStale(): Promise<void> {
    const stale = await this.prisma.$queryRaw<{ id: string; customer_id: string | null; cleaner_id: string | null; cleaner_payout: number | null }[]>`
      SELECT id, customer_id, cleaner_id, cleaner_payout
        FROM bookings
       WHERE status = 'in_progress'
         AND COALESCE(pricing_mode, '') <> 'hourly'
         AND COALESCE(started_at, matched_at, created_at) < NOW() - (${STALE_HOURS}::int * INTERVAL '1 hour')
    `;
    if (stale.length === 0) return;

    this.log.warn(`Auto-complete: ${stale.length} bookings in_progress > ${STALE_HOURS}h`);

    for (const b of stale) {
      try {
        // Safety net: kalau cleaner_payout null/0, hitung dulu sebelum complete
        if (b.cleaner_id && (!b.cleaner_payout || Number(b.cleaner_payout) <= 0)) {
          const ctx = await this.prisma.$queryRaw<{ base: number; travel: number; brings_tools: boolean | null; pricing_mode: string | null; hourly_share_pct: number | null }[]>`
            SELECT COALESCE(bk.base_amount, bk.total_amount) AS base,
                   COALESCE(bk.travel_fee, 0) AS travel,
                   cp.brings_tools,
                   bk.pricing_mode,
                   ht.cleaner_share_pct AS hourly_share_pct
              FROM bookings bk
              LEFT JOIN cleaner_profiles cp ON cp.user_id = ${b.cleaner_id}::uuid
              LEFT JOIN pricing_hourly_tiers ht ON ht.id = bk.hourly_tier_id
             WHERE bk.id = ${b.id}::uuid LIMIT 1
          `;
          if (ctx[0]) {
            const base = Number(ctx[0].base ?? 0);
            const travel = Number(ctx[0].travel ?? 0);
            const bringsTools = !!ctx[0].brings_tools;
            const isHourly = ctx[0].pricing_mode === 'hourly';
            let sharePct: number;
            if (isHourly && ctx[0].hourly_share_pct != null) {
              sharePct = Number(ctx[0].hourly_share_pct);
            } else {
              const tiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
                SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools
                  FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
              `;
              const tier = tiers.find((t) => base >= Number(t.range_min ?? 0) && (t.range_max == null || base <= Number(t.range_max)));
              sharePct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
            }
            const payout = Math.round(base * sharePct / 100) + travel;
            if (payout > 0) {
              await this.prisma.$executeRaw`UPDATE bookings SET cleaner_payout = ${payout}::bigint WHERE id = ${b.id}::uuid`;
              b.cleaner_payout = payout;
            }
          }
        }

        await this.prisma.$transaction([
          this.prisma.$executeRaw`
            UPDATE bookings
               SET status = 'completed',
                   completed_at = NOW(),
                   admin_notes = COALESCE(admin_notes, '') || E'\n[auto] in_progress > ${STALE_HOURS}h, force-complete'
             WHERE id = ${b.id}::uuid AND status = 'in_progress'
          `,
          ...(b.cleaner_id && Number(b.cleaner_payout ?? 0) > 0 ? [
            this.prisma.$executeRaw`
              INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
              VALUES (${b.cleaner_id}::uuid, 'earnings', ${b.cleaner_payout}::bigint, 'booking', ${b.id}::uuid, 'PENDING', NULL, 'Earning auto-complete — escrow 24 jam')
              ON CONFLICT DO NOTHING
            `,
          ] : []),
        ]);
        if (b.customer_id) {
          void this.push.send({
            userId: b.customer_id, channel: 'booking',
            title: 'Pesanan otomatis diselesaikan',
            body: 'Tim kami otomatis menyelesaikan pesananmu yang sudah > 4 jam. Yuk kasih rating!',
            data: { type: 'auto_completed', bookingId: b.id },
          }).catch(() => {});
        }
        // Referral 5% commission (recurring per order).
        await this.referralPayout.payoutForCompletedBooking(b.id);
      } catch (e) {
        this.log.error(`Auto-complete failed for booking ${b.id}: ${e}`);
      }
    }
  }
}
