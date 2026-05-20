import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

@Injectable()
export class CleanerInactivityService {
  private readonly log = new Logger(CleanerInactivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // Run jam 03:00 WIB tiap hari (off-peak). Suspend cleaner yang gak aktif >N hari.
  @Cron('0 20 * * *') // 20:00 UTC = 03:00 WIB next day
  async suspendInactive(): Promise<void> {
    const cfg = await this.prisma.$queryRaw<{ value: any }[]>`
      SELECT value FROM app_config WHERE key = 'cleaner.inactivity_suspend_days' LIMIT 1
    `;
    const v = cfg[0]?.value;
    const days = (() => {
      if (v == null) return 14;
      const n = Number(typeof v === 'string' ? v.replace(/"/g, '') : v);
      return Number.isFinite(n) && n > 0 ? n : 14;
    })();

    // "Aktif" = ada job accepted dalam N hari ATAU login dalam N hari (last_seen_at).
    const candidates = await this.prisma.$queryRaw<{ id: string; name: string | null }[]>`
      SELECT u.id, u.name
        FROM users u
        JOIN cleaner_profiles cp ON cp.user_id = u.id
       WHERE u.is_freelancer = TRUE
         AND u.status = 'active'
         AND u.deleted_at IS NULL
         AND cp.kyc_status = 'approved'
         AND COALESCE(u.last_seen_at, u.created_at) < NOW() - (${days}::int * INTERVAL '1 day')
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
            WHERE b.cleaner_id = u.id
              AND b.created_at > NOW() - (${days}::int * INTERVAL '1 day')
         )
       LIMIT 500
    `;
    if (candidates.length === 0) {
      this.log.log(`No inactive cleaners to suspend (threshold ${days}d).`);
      return;
    }

    for (const c of candidates) {
      await this.prisma.$executeRaw`UPDATE users SET status = 'suspended' WHERE id = ${c.id}::uuid`;
      await this.prisma.$executeRaw`UPDATE cleaner_profiles SET is_available = FALSE WHERE user_id = ${c.id}::uuid`;
      void this.push.send({
        userId: c.id, channel: 'system',
        title: 'Akun di-suspend (inactivity)',
        body: `Akun di-suspend karena gak aktif ${days} hari. Hubungi admin untuk aktifkan kembali.`,
        data: { type: 'cleaner_suspended_inactivity' },
      }).catch(() => {});
    }
    this.log.warn(`Suspended ${candidates.length} inactive cleaner(s).`);
  }
}
