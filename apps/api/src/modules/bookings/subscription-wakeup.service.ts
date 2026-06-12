import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { JobsGateway } from '../jobs/jobs.gateway';

/**
 * Subscription visit wake-up: setiap jam cek child bookings yang scheduled_at < NOW() + 24h
 * dan status='scheduled_future', ubah ke 'searching' supaya cleaner matching jalan.
 *
 * Filosofi: H-1 (24 jam sebelum) cleaner bisa lihat job offer. Cukup waktu accept + planning.
 */
@Injectable()
export class SubscriptionWakeupService {
  private readonly log = new Logger(SubscriptionWakeupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsGateway,
  ) {}

  // Setiap jam
  @Cron('0 * * * *')
  async wakeUpFutureVisits(): Promise<void> {
    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        UPDATE bookings
           SET status = 'searching'
         WHERE status = 'scheduled_future'
           AND parent_booking_id IS NOT NULL
           AND scheduled_at <= NOW() + INTERVAL '24 hours'
         RETURNING id
      `;
      if (rows.length === 0) return;
      this.log.log(`Woke up ${rows.length} subscription visit(s) for cleaner matching`);
      // Broadcast tiap visit ke cleaner
      for (const r of rows) {
        try { await this.jobs.broadcastIncomingJob(r.id); } catch { /* non-fatal */ }
      }
    } catch (e: any) {
      this.log.error(`Wake-up failed: ${e?.message ?? e}`);
    }
  }
}
