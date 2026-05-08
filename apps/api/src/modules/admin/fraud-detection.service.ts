import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';

export type FraudDetectionResult = {
  highCancelRateCleaners: number;
  highRefundRateCustomers: number;
  sharedDevices: number;
  offPlatformChats: number;
};

@Injectable()
export class FraudDetectionService {
  private readonly log = new Logger(FraudDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Run setiap 1 jam (00 minute). Mark setiap strike biar ga duplicate dalam 7 hari.
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledRun(): Promise<void> {
    try {
      const r = await this.runDetection();
      const total = r.highCancelRateCleaners + r.highRefundRateCustomers + r.sharedDevices + r.offPlatformChats;
      if (total > 0) this.log.warn(`fraud detection: ${total} new strikes — ${JSON.stringify(r)}`);
    } catch (e: any) {
      this.log.error(`fraud detection scheduled run failed: ${e?.message}`);
    }
  }

  async runDetection(): Promise<FraudDetectionResult> {
    const results: FraudDetectionResult = {
      highCancelRateCleaners: 0,
      highRefundRateCustomers: 0,
      sharedDevices: 0,
      offPlatformChats: 0,
    };

    const r1 = await this.prisma.$executeRaw`
      WITH stats AS (
        SELECT cleaner_id,
               COUNT(*)::int AS total,
               SUM(CASE WHEN status = 'cancelled' AND cancellation_reason NOT IN ('admin_ban', 'customer_cancel') THEN 1 ELSE 0 END)::int AS cancelled
          FROM bookings
         WHERE cleaner_id IS NOT NULL AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY cleaner_id HAVING COUNT(*) >= 5
      )
      INSERT INTO fraud_strikes (user_id, strike_type, details)
      SELECT cleaner_id, 'high_cancel_rate',
             jsonb_build_object('total', total, 'cancelled', cancelled, 'rate', ROUND(cancelled::numeric / total * 100, 1))
        FROM stats
       WHERE cancelled::numeric / total > 0.30
         AND NOT EXISTS (
           SELECT 1 FROM fraud_strikes fs
            WHERE fs.user_id = stats.cleaner_id
              AND fs.strike_type = 'high_cancel_rate'
              AND fs.created_at > NOW() - INTERVAL '7 days'
         )
    `;
    results.highCancelRateCleaners = Number(r1);

    const r2 = await this.prisma.$executeRaw`
      WITH stats AS (
        SELECT customer_id,
               COUNT(*)::int AS total,
               SUM(CASE WHEN id IN (SELECT booking_id FROM disputes WHERE payout_amount IS NOT NULL AND payout_amount > 0) THEN 1 ELSE 0 END)::int AS refunded
          FROM bookings WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY customer_id HAVING COUNT(*) >= 4
      )
      INSERT INTO fraud_strikes (user_id, strike_type, details)
      SELECT customer_id, 'high_refund_rate',
             jsonb_build_object('total', total, 'refunded', refunded, 'rate', ROUND(refunded::numeric / total * 100, 1))
        FROM stats
       WHERE refunded::numeric / total > 0.25
         AND NOT EXISTS (
           SELECT 1 FROM fraud_strikes fs
            WHERE fs.user_id = stats.customer_id AND fs.strike_type = 'high_refund_rate'
              AND fs.created_at > NOW() - INTERVAL '7 days'
         )
    `;
    results.highRefundRateCustomers = Number(r2);

    const r3 = await this.prisma.$executeRaw`
      WITH shared AS (
        SELECT device_fingerprint, ARRAY_AGG(DISTINCT user_id) AS user_ids
          FROM user_devices
         WHERE device_fingerprint IS NOT NULL
         GROUP BY device_fingerprint HAVING COUNT(DISTINCT user_id) > 1
      )
      INSERT INTO fraud_strikes (user_id, strike_type, details)
      SELECT UNNEST(user_ids), 'shared_device',
             jsonb_build_object('fingerprint', device_fingerprint, 'shared_with_count', array_length(user_ids, 1))
        FROM shared
       WHERE NOT EXISTS (
         SELECT 1 FROM fraud_strikes fs
          WHERE fs.user_id = ANY(shared.user_ids)
            AND fs.strike_type = 'shared_device'
            AND fs.details->>'fingerprint' = shared.device_fingerprint
       )
    `;
    results.sharedDevices = Number(r3);

    const r4 = await this.prisma.$executeRaw`
      INSERT INTO fraud_strikes (user_id, strike_type, reference_id, details)
      SELECT cm.sender_id, 'off_platform_chat', cm.id,
             jsonb_build_object('booking_id', cm.booking_id, 'snippet', LEFT(cm.content, 100))
        FROM chat_messages cm
       WHERE cm.created_at > NOW() - INTERVAL '7 days'
         AND cm.sender_id IS NOT NULL AND cm.content IS NOT NULL
         AND (
           cm.content ~* '(0[2-9][0-9]{8,11})'
           OR cm.content ~* '\\b(wa|whatsapp|wa\\.me|chat\\s+wa)\\b'
           OR cm.content ~* '\\b(transfer|tf|bca|mandiri|bri|bni)\\b'
           OR cm.content ~* '\\b(cash|tunai\\s+aja|off\\s*app|luar\\s+app)\\b'
         )
         AND NOT EXISTS (
           SELECT 1 FROM fraud_strikes fs
            WHERE fs.reference_id = cm.id AND fs.strike_type = 'off_platform_chat'
         )
    `;
    results.offPlatformChats = Number(r4);

    return results;
  }
}
