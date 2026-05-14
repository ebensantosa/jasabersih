import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

const COOLING_HOURS = 24;

@Injectable()
export class WalletClearService {
  private readonly log = new Logger(WalletClearService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // Run setiap 15 menit — escrow release ASAP.
  @Cron('*/15 * * * *')
  async clearMature(): Promise<void> {
    // Ambil entries yang akan di-clear (untuk notif), lalu update batch
    const toClear = await this.prisma.$queryRaw<{ id: string; user_id: string; amount: number; reference_id: string | null }[]>`
      SELECT id, user_id, amount, reference_id FROM wallet_ledger_entries
       WHERE status = 'PENDING'
         AND account_type = 'earnings'
         AND created_at < NOW() - (${COOLING_HOURS}::int * INTERVAL '1 hour')
         AND NOT EXISTS (
           SELECT 1 FROM disputes d
            WHERE d.booking_id = wallet_ledger_entries.reference_id
              AND d.status IN ('open', 'in_progress', 'escalated')
         )
    `;
    if (toClear.length === 0) return;

    const result = await this.prisma.$executeRaw`
      UPDATE wallet_ledger_entries
         SET status = 'CLEARED', cleared_at = NOW()
       WHERE status = 'PENDING'
         AND account_type = 'earnings'
         AND created_at < NOW() - (${COOLING_HOURS}::int * INTERVAL '1 hour')
         AND NOT EXISTS (
           SELECT 1 FROM disputes d
            WHERE d.booking_id = wallet_ledger_entries.reference_id
              AND d.status IN ('open', 'in_progress', 'escalated')
         )
    `;
    this.log.log(`Cleared ${result} matured wallet entries (${COOLING_HOURS}h cooling-off, no active dispute)`);

    // Group by user → kirim 1 notif per cleaner dengan total
    const byUser = new Map<string, { total: number; count: number; bookingId: string | null }>();
    for (const e of toClear) {
      const cur = byUser.get(e.user_id) ?? { total: 0, count: 0, bookingId: null };
      cur.total += Number(e.amount);
      cur.count += 1;
      cur.bookingId = e.reference_id;
      byUser.set(e.user_id, cur);
    }
    for (const [userId, data] of byUser) {
      void this.push.send({
        userId,
        channel: 'wallet',
        title: 'Earning kamu cair 💰',
        body: data.count === 1
          ? `Rp ${data.total.toLocaleString('id-ID')} masuk ke saldo (sudah lewat garansi 24 jam). Bisa langsung ditarik.`
          : `${data.count} earning total Rp ${data.total.toLocaleString('id-ID')} masuk ke saldo. Bisa langsung ditarik.`,
        data: { type: 'earnings_cleared', amount: data.total, count: data.count, bookingId: data.bookingId ?? undefined },
      }).catch(() => {});
    }
  }
}
