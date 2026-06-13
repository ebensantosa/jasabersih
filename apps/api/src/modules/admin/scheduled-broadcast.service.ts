import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

type Audience = 'all' | 'customer' | 'cleaner' | 'kyc_approved' | 'new_customer_7d' | 'inactive_30d';

@Injectable()
export class ScheduledBroadcastService {
  private readonly log = new Logger(ScheduledBroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // Tiap menit cek scheduled broadcast yg waktunya udah lewat
  @Cron('* * * * *')
  async runDuePushes(): Promise<void> {
    const due = await this.prisma.$queryRaw<{ id: string; title: string; body: string; audience: string; cta_link: string | null }[]>`
      SELECT id, title, body, audience, cta_link
        FROM scheduled_broadcasts
       WHERE status = 'pending' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT 5
    `;
    if (due.length === 0) return;

    for (const b of due) {
      try {
        const targets = await this.findTargets(b.audience as Audience);
        let sent = 0, failed = 0;
        for (const userId of targets) {
          try {
            await this.push.send({
              userId,
              title: b.title,
              body: b.body,
              channel: 'system',
              data: { type: 'broadcast', ...(b.cta_link ? { ctaLink: b.cta_link } : {}) },
            });
            sent++;
          } catch { failed++; }
        }
        await this.prisma.$executeRaw`
          UPDATE scheduled_broadcasts
             SET status = 'sent', sent_at = NOW(),
                 sent_count = ${sent}, failed_count = ${failed}
           WHERE id = ${b.id}::uuid
        `;
        this.log.log(`Scheduled broadcast ${b.id}: ${sent} sent, ${failed} failed`);
      } catch (e: any) {
        await this.prisma.$executeRaw`
          UPDATE scheduled_broadcasts
             SET status = 'failed', error_msg = ${e?.message ?? 'unknown'}
           WHERE id = ${b.id}::uuid
        `;
        this.log.error(`Scheduled broadcast ${b.id} failed: ${e?.message ?? e}`);
      }
    }
  }

  private async findTargets(audience: Audience): Promise<string[]> {
    let extraWhere = '';
    switch (audience) {
      case 'customer': extraWhere = `AND u.is_customer = TRUE AND (u.status = 'active' OR u.status IS NULL)`; break;
      case 'cleaner': extraWhere = `AND u.is_freelancer = TRUE AND (u.status = 'active' OR u.status IS NULL)`; break;
      case 'kyc_approved': extraWhere = `AND u.is_freelancer = TRUE AND EXISTS (SELECT 1 FROM cleaner_profiles cp WHERE cp.user_id = u.id AND cp.kyc_status = 'approved')`; break;
      case 'new_customer_7d': extraWhere = `AND u.is_customer = TRUE AND u.created_at >= NOW() - INTERVAL '7 days'`; break;
      case 'inactive_30d': extraWhere = `AND u.is_customer = TRUE AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = u.id AND b.created_at >= NOW() - INTERVAL '30 days')`; break;
      default: extraWhere = `AND (u.status = 'active' OR u.status IS NULL)`;
    }
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT DISTINCT u.id FROM users u
        WHERE u.deleted_at IS NULL ${extraWhere}
          AND EXISTS (SELECT 1 FROM user_devices ud WHERE ud.user_id = u.id AND ud.fcm_token IS NOT NULL)
        LIMIT 50000`,
    );
    return rows.map((r) => r.id);
  }
}
