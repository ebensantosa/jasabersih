import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

// Auto-complete booking yang stuck in_progress > 4 jam.
// Cleaner kemungkinan lupa tap "Selesai" atau koneksi terputus → uang stuck.
const STALE_HOURS = 4;

@Injectable()
export class AutoCompleteService {
  private readonly log = new Logger(AutoCompleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async autoCompleteStale(): Promise<void> {
    const stale = await this.prisma.$queryRaw<{ id: string; customer_id: string | null; cleaner_id: string | null; cleaner_payout: number | null }[]>`
      SELECT id, customer_id, cleaner_id, cleaner_payout
        FROM bookings
       WHERE status = 'in_progress'
         AND COALESCE(started_at, matched_at, created_at) < NOW() - (${STALE_HOURS}::int * INTERVAL '1 hour')
    `;
    if (stale.length === 0) return;

    this.log.warn(`Auto-complete: ${stale.length} bookings in_progress > ${STALE_HOURS}h`);

    for (const b of stale) {
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
    }
  }
}
