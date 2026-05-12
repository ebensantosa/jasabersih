import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

// Push customer to rate cleaner 24h after completion if not yet rated.
// Boost rating coverage → cleaner accountability.
@Injectable()
export class RatingReminderService {
  private readonly log = new Logger(RatingReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // Run twice a day (10am, 6pm) — non-urgent
  @Cron('0 10,18 * * *')
  async remind(): Promise<void> {
    const candidates = await this.prisma.$queryRaw<{ id: string; customer_id: string }[]>`
      SELECT b.id, b.customer_id
        FROM bookings b
       WHERE b.status = 'completed'
         AND b.completed_at BETWEEN NOW() - INTERVAL '7 days' AND NOW() - INTERVAL '24 hours'
         AND b.rating_reminder_sent_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.booking_id = b.id LIMIT 1)
    `;
    if (candidates.length === 0) return;
    this.log.log(`Sending rating reminder to ${candidates.length} customers`);

    for (const b of candidates) {
      await this.prisma.$executeRaw`
        UPDATE bookings SET rating_reminder_sent_at = NOW() WHERE id = ${b.id}::uuid
      `;
      void this.push.send({
        userId: b.customer_id, channel: 'booking',
        title: 'Yuk kasih rating 🌟',
        body: 'Pesananmu udah selesai kemarin. Rating membantu cleaner kami berkembang.',
        data: { type: 'rating_reminder', bookingId: b.id },
      }).catch(() => {});
    }
  }
}
