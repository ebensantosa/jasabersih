import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Chat retention: hapus pesan dari booking yang sudah completed > 14 hari
 * - Hemat storage (PDP compliance)
 * - Tetap simpan untuk booking aktif & dispute window
 */
const RETENTION_DAYS = 14;

@Injectable()
export class ChatRetentionService {
  private readonly log = new Logger(ChatRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldChats(): Promise<void> {
    const oldChatPhotos = await this.prisma.$queryRaw<{ attachment_url: string | null }[]>`
      SELECT cm.attachment_url
        FROM chat_messages cm
       WHERE cm.booking_id IN (
         SELECT id
           FROM bookings
          WHERE status IN ('completed', 'canceled')
            AND COALESCE(completed_at, canceled_at) < NOW() - (${RETENTION_DAYS}::int * INTERVAL '1 day')
            AND NOT EXISTS (
              SELECT 1
                FROM disputes d
               WHERE d.booking_id = bookings.id
                 AND d.status IN ('open', 'in_progress', 'escalated')
            )
       )
         AND cm.message_type = 'image'
         AND cm.attachment_url IS NOT NULL
    `;

    let deletedFiles = 0;
    for (const row of oldChatPhotos) {
      const key = this.extractKey(row.attachment_url);
      if (!key) continue;
      try {
        await this.storage.deleteObject('public', key);
        deletedFiles++;
      } catch (e: any) {
        this.log.warn(`Skip chat attachment ${key}: ${e?.message}`);
      }
    }

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
      this.log.log(`Pruned ${result} chat messages and ${deletedFiles} attachments (>${RETENTION_DAYS}d, no active dispute)`);
    }
  }

  private extractKey(url: string | null): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.pathname.replace(/^\//, '');
    } catch {
      return null;
    }
  }
}
