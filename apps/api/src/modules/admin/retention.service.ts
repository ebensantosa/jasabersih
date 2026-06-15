import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../storage/storage.service';

const RETENTION_DAYS = 40;

@Injectable()
export class RetentionService {
  private readonly log = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Run daily at 02:00 — clean old data while traffic low
  @Cron('0 2 * * *')
  async scheduledRun(): Promise<void> {
    try {
      const r = await this.run();
      this.log.log(`retention purge: ${JSON.stringify(r)}`);
    } catch (e: any) {
      this.log.error(`retention failed: ${e?.message}`);
    }
  }

  async run(): Promise<{ chatDeleted: number; photosDeleted: number; r2FilesDeleted: number; bookingsAnonymized: number }> {
    // 1. Delete chat messages > 40 days. Foto chat juga jadi 'orphan' di R2 - cleanup sekalian
    // sebelum row dihapus.
    const oldChatPhotos = await this.prisma.$queryRaw<{ attachment_url: string | null }[]>`
      SELECT attachment_url FROM chat_messages
       WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         AND message_type = 'image' AND attachment_url IS NOT NULL
    `;
    let r2FilesDeleted = 0;
    for (const row of oldChatPhotos) {
      const key = this.extractKey(row.attachment_url);
      if (key) {
        try {
          await this.storage.deleteObject('public', key);
          r2FilesDeleted++;
        } catch (e: any) {
          this.log.warn(`R2 delete failed for chat ${key}: ${e?.message}`);
        }
      }
    }
    const chat = await this.prisma.$executeRaw`
      DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
    `;

    // 2. Delete booking_photos > 40 days + cleanup file di R2.
    const oldBookingPhotos = await this.prisma.$queryRaw<{ storage_path: string | null }[]>`
      SELECT storage_path FROM booking_photos
       WHERE uploaded_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
    `;
    for (const row of oldBookingPhotos) {
      if (row.storage_path) {
        try {
          await this.storage.deleteObject('public', row.storage_path);
          r2FilesDeleted++;
        } catch (e: any) {
          this.log.warn(`R2 delete failed for booking_photo ${row.storage_path}: ${e?.message}`);
        }
      }
    }
    const photos = await this.prisma.$executeRaw`
      DELETE FROM booking_photos WHERE uploaded_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
    `;

    // 3. Anonymize old bookings — keep aggregate but null out PII (form_snapshot, address_line)
    // Tetap simpan id/total/status untuk financial audit, tapi hapus alamat & detail customer notes
    const bookingsAnon = await this.prisma.$executeRaw`
      UPDATE bookings
         SET form_snapshot = '{}'::jsonb,
             customer_notes = NULL
       WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         AND form_snapshot::text != '{}'
    `;

    return {
      chatDeleted: Number(chat),
      photosDeleted: Number(photos),
      r2FilesDeleted,
      bookingsAnonymized: Number(bookingsAnon),
    };
  }

  // R2 public URL bentuk: https://pub-xxx.r2.dev/<key> atau <CUSTOM_DOMAIN>/<key>.
  // Storage key adalah path setelah domain root.
  private extractKey(url: string | null): string | null {
    if (!url) return null;
    try {
      const u = new URL(url);
      return u.pathname.replace(/^\//, '');
    } catch {
      return null;
    }
  }
}
