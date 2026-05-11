import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

const SEARCH_TIMEOUT_MIN = 15;

@Injectable()
export class SearchTimeoutService {
  private readonly log = new Logger(SearchTimeoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Setiap 1 menit: cek booking dengan status='searching' yang sudah lewat 15 menit.
   * Set search_timed_out_at = NOW(). Status tetap 'searching' supaya admin bisa
   * manual assign dari dashboard. Push notif ke customer + log untuk admin.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkTimeouts(): Promise<void> {
    const expired = await this.prisma.$queryRaw<{ id: string; customer_id: string }[]>`
      SELECT id, customer_id FROM bookings
       WHERE status = 'searching'
         AND cleaner_id IS NULL
         AND created_at < NOW() - (${SEARCH_TIMEOUT_MIN}::int * INTERVAL '1 minute')
         AND search_timed_out_at IS NULL
    `;
    if (expired.length === 0) return;

    this.log.warn(`Search timeout: ${expired.length} bookings need manual admin assignment`);

    for (const b of expired) {
      await this.prisma.$executeRaw`
        UPDATE bookings SET search_timed_out_at = NOW() WHERE id = ${b.id}::uuid
      `;
      // Push notif ke customer
      void this.push.send({
        userId: b.customer_id,
        channel: 'booking',
        title: 'Tim CS akan bantu carikan cleaner',
        body: 'Belum ada cleaner yang respons dalam 15 menit. Tim CS lagi cariin secara manual — biasanya selesai dalam 30 menit.',
        data: { type: 'search_timeout', bookingId: b.id },
      }).catch(() => {});
    }
  }
}
