import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

// Auto-cancel booking yang stuck di pending_payment > 24 jam.
// Customer pasti sudah lupa atau Flip checkout expired.
const PAYMENT_TIMEOUT_HOURS = 24;

@Injectable()
export class PaymentTimeoutService {
  private readonly log = new Logger(PaymentTimeoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // Setiap jam — cukup karena kita pake batas 24 jam, gak butuh real-time.
  @Cron(CronExpression.EVERY_HOUR)
  async cancelStaleUnpaid(): Promise<void> {
    const stale = await this.prisma.$queryRaw<{ id: string; customer_id: string }[]>`
      SELECT id, customer_id FROM bookings
       WHERE status = 'pending_payment'
         AND created_at < NOW() - (${PAYMENT_TIMEOUT_HOURS}::int * INTERVAL '1 hour')
    `;
    if (stale.length === 0) return;

    this.log.warn(`Auto-cancel: ${stale.length} unpaid bookings >${PAYMENT_TIMEOUT_HOURS}h old`);

    for (const b of stale) {
      await this.prisma.$executeRaw`
        UPDATE bookings
           SET status = 'canceled',
               canceled_at = NOW(),
               cancellation_reason = 'Pembayaran tidak diselesaikan dalam 24 jam (auto-cancel)'
         WHERE id = ${b.id}::uuid AND status = 'pending_payment'
      `;
      // Mark related Flip payments as expired
      await this.prisma.$executeRaw`
        UPDATE payments SET status = 'expired'
         WHERE booking_id = ${b.id}::uuid AND status = 'pending'
      `;
      // Notif auto-cancel disabled - user sebelumnya gak follow-up bayar,
      // notif ini bikin spam noise (tampil banyak kalau banyak booking expired
      // bersamaan). Status update aja di app, gak perlu push.
    }
  }
}
