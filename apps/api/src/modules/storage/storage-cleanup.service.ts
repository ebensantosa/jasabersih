import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { StorageService } from './storage.service';

// Cost & privacy hygiene:
// - Booking photos for canceled bookings > 30 days → delete from R2 + db
// - KYC docs for rejected applications > 30 days → delete from R2 + db
const RETENTION_DAYS = 30;

@Injectable()
export class StorageCleanupService {
  private readonly log = new Logger(StorageCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Daily 03:00 — off-peak
  @Cron('0 3 * * *')
  async cleanup(): Promise<void> {
    await this.cleanupCanceledBookingPhotos().catch((e) => this.log.error(`cleanup booking photos: ${e?.message}`));
    await this.cleanupRejectedKycDocs().catch((e) => this.log.error(`cleanup kyc docs: ${e?.message}`));
  }

  private async cleanupCanceledBookingPhotos(): Promise<void> {
    const photos = await this.prisma.$queryRaw<{ id: string; storage_path: string }[]>`
      SELECT bp.id, bp.storage_path
        FROM booking_photos bp
        JOIN bookings b ON b.id = bp.booking_id
       WHERE b.status = 'canceled'
         AND b.canceled_at < NOW() - (${RETENTION_DAYS}::int * INTERVAL '1 day')
       LIMIT 500
    `;
    if (photos.length === 0) return;
    this.log.log(`Cleanup ${photos.length} booking photos from canceled bookings > ${RETENTION_DAYS}d`);
    for (const p of photos) {
      try {
        await this.storage.deleteObject('public', p.storage_path);
        await this.prisma.$executeRaw`DELETE FROM booking_photos WHERE id = ${p.id}::uuid`;
      } catch (e: any) {
        this.log.warn(`Skip photo ${p.id}: ${e?.message}`);
      }
    }
  }

  private async cleanupRejectedKycDocs(): Promise<void> {
    const docs = await this.prisma.$queryRaw<{ id: string; storage_path: string }[]>`
      SELECT kd.id, kd.storage_path
        FROM kyc_documents kd
        JOIN cleaner_profiles cp ON cp.user_id = kd.user_id
       WHERE cp.kyc_status = 'rejected'
         AND cp.updated_at < NOW() - (${RETENTION_DAYS}::int * INTERVAL '1 day')
       LIMIT 500
    `;
    if (docs.length === 0) return;
    this.log.log(`Cleanup ${docs.length} KYC docs from rejected applications > ${RETENTION_DAYS}d`);
    for (const d of docs) {
      try {
        await this.storage.deleteObject('private', d.storage_path);
        await this.prisma.$executeRaw`DELETE FROM kyc_documents WHERE id = ${d.id}::uuid`;
      } catch (e: any) {
        this.log.warn(`Skip kyc doc ${d.id}: ${e?.message}`);
      }
    }
  }
}
