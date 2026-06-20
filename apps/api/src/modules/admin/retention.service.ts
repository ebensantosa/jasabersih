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

  // Run daily at 02:00 UTC = 09:00 WIB - sengaja off-peak (server timezone UTC).
  // Pakai timezone explicit supaya konsisten lintas server config.
  @Cron('0 2 * * *', { timeZone: 'UTC' })
  async scheduledRun(): Promise<void> {
    try {
      const r = await this.run();
      this.log.log(`retention purge: ${JSON.stringify(r)}`);
    } catch (e: any) {
      this.log.error(`retention failed: ${e?.message}`);
    }
  }

  async run(): Promise<{ chatDeleted: number; photosDeleted: number; r2FilesDeleted: number; bookingsAnonymized: number }> {
    let r2FilesDeleted = 0;

    // Delete booking_photos > 40 days + cleanup file di R2.
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

    // Anonymize old bookings - keep aggregate but null out PII.
    const bookingsAnon = await this.prisma.$executeRaw`
      UPDATE bookings
         SET form_snapshot = '{}'::jsonb,
             customer_notes = NULL
       WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         AND form_snapshot::text != '{}'
    `;

    return {
      chatDeleted: 0,
      photosDeleted: Number(photos),
      r2FilesDeleted,
      bookingsAnonymized: Number(bookingsAnon),
    };
  }
}
