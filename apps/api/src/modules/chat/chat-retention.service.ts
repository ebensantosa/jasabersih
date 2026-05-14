import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';

/**
 * Chat retention: hapus pesan dari booking yang sudah completed > 14 hari
 * - Hemat storage (PDP compliance)
 * - Tetap simpan untuk booking aktif & dispute window
 */
const RETENTION_DAYS = 14;

@Injectable()
export class ChatRetentionService {
  private readonly log = new Logger(ChatRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldChats(): Promise<void> {
    const result = await this.prisma.$executeRaw`
      DELETE FROM chat_messages
       WHERE booking_id IN (
         SELECT id FROM bookings
          WHERE status IN ('completed', 'canceled')
            AND COALESCE(completed_at, canceled_at) < NOW() - (${RETENTION_DAYS}::int * INTERVAL '1 day')
            -- Skip kalau ada dispute aktif untuk booking ini
            AND NOT EXISTS (
              SELECT 1 FROM disputes d
               WHERE d.booking_id = bookings.id
                 AND d.status IN ('open', 'in_progress', 'escalated')
            )
       )
    `;
    if (Number(result) > 0) {
      this.log.log(`Pruned ${result} chat messages (booking completed/canceled >${RETENTION_DAYS}d ago, no active dispute)`);
    }
  }
}
