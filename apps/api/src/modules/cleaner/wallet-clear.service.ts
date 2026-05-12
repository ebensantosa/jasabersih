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

  @Cron(CronExpression.EVERY_HOUR)
  async clearMature(): Promise<void> {
    const result = await this.prisma.$executeRaw`
      UPDATE wallet_ledger_entries
         SET status = 'CLEARED', cleared_at = NOW()
       WHERE status = 'PENDING'
         AND created_at < NOW() - (${COOLING_HOURS}::int * INTERVAL '1 hour')
    `;
    if (Number(result) > 0) this.log.log(`Cleared ${result} matured wallet entries (${COOLING_HOURS}h cooling-off)`);
  }
}
