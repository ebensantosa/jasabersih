import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';

const RETENTION_DAYS = 40;

@Injectable()
export class RetentionService {
  private readonly log = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async run(): Promise<{ chatDeleted: number; photosDeleted: number; bookingsAnonymized: number }> {
    // 1. Delete chat messages > 40 days
    const chat = await this.prisma.$executeRaw`
      DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
    `;

    // 2. Delete booking photos rows > 40 days (R2 file cleanup TODO via lifecycle rule)
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
      bookingsAnonymized: Number(bookingsAnon),
    };
  }
}
