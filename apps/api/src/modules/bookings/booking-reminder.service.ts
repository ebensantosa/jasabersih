import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

// Push reminder ke cleaner T-30min sebelum scheduled time, ke customer T-1h.
// Idempotent via reminder_sent_at column on bookings.
@Injectable()
export class BookingReminderService {
  private readonly log = new Logger(BookingReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendReminders(): Promise<void> {
    // Cleaner T-30min: matched + scheduled within next 30 min, no reminder yet
    const cleanerJobs = await this.prisma.$queryRaw<{ id: string; cleaner_id: string; scheduled_at: Date }[]>`
      SELECT id, cleaner_id, scheduled_at
        FROM bookings
       WHERE status = 'matched'
         AND cleaner_id IS NOT NULL
         AND scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '30 minutes'
         AND cleaner_reminder_sent_at IS NULL
    `;
    for (const b of cleanerJobs) {
      await this.prisma.$executeRaw`
        UPDATE bookings SET cleaner_reminder_sent_at = NOW() WHERE id = ${b.id}::uuid
      `;
      void this.push.send({
        userId: b.cleaner_id, channel: 'booking',
        title: 'Job dalam 30 menit ⏰',
        body: 'Siap-siap berangkat ke lokasi customermu. Tap untuk lihat detail.',
        data: { type: 'cleaner_reminder', bookingId: b.id },
      }).catch(() => {});
    }
    if (cleanerJobs.length > 0) this.log.log(`Cleaner reminders sent: ${cleanerJobs.length}`);

    // Customer T-1h: matched + scheduled within next 1h, no reminder yet
    const customerJobs = await this.prisma.$queryRaw<{ id: string; customer_id: string; scheduled_at: Date }[]>`
      SELECT id, customer_id, scheduled_at
        FROM bookings
       WHERE status = 'matched'
         AND scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
         AND customer_reminder_sent_at IS NULL
    `;
    for (const b of customerJobs) {
      await this.prisma.$executeRaw`
        UPDATE bookings SET customer_reminder_sent_at = NOW() WHERE id = ${b.id}::uuid
      `;
      void this.push.send({
        userId: b.customer_id, channel: 'booking',
        title: 'Cleaner akan datang dalam 1 jam',
        body: 'Pastikan akses ke lokasi siap. Cek detail pesananmu.',
        data: { type: 'customer_reminder', bookingId: b.id },
      }).catch(() => {});
    }
    if (customerJobs.length > 0) this.log.log(`Customer reminders sent: ${customerJobs.length}`);
  }
}
