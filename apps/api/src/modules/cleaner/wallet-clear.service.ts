import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';

// Wallet PENDING → CLEARED setelah 24 jam (cooling-off dispute window).
// Saat ini sebagian flow insert langsung dengan status='CLEARED' (mis. di
// auto-complete service). Cron ini handle entri yang explicitly PENDING
// (untuk future: kalau kita pindah ke flow PENDING-by-default).
const COOLING_HOURS = 24;

@Injectable()
export class WalletClearService {
  private readonly log = new Logger(WalletClearService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Run setiap 15 menit (lebih responsif dibanding HOUR) — escrow release ASAP.
  @Cron('*/15 * * * *')
  async clearMature(): Promise<void> {
    // Skip entries yang booking-nya punya dispute aktif (open/in_progress/escalated)
    // — admin harus resolve dulu sebelum cleaner dapat uang.
    const result = await this.prisma.$executeRaw`
      UPDATE wallet_ledger_entries w
         SET status = 'CLEARED', cleared_at = NOW()
       WHERE w.status = 'PENDING'
         AND w.created_at < NOW() - (${COOLING_HOURS}::int * INTERVAL '1 hour')
         AND NOT EXISTS (
           SELECT 1 FROM disputes d
            WHERE d.booking_id = w.reference_id
              AND d.status IN ('open', 'in_progress', 'escalated')
         )
    `;
    if (Number(result) > 0) this.log.log(`Cleared ${result} matured wallet entries (${COOLING_HOURS}h cooling-off, no active dispute)`);
  }
}
