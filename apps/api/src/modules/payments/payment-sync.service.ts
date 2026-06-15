import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';
import { FlipService } from './flip.service';
import { TripayService } from './tripay.service';

/**
 * Self-heal customer payment status. Mirror withdrawal-sync, tapi utk
 * Accept Payment (Flip) + Tripay yang udah bayar tapi callback gagal/telat.
 *
 * Tiap 3 menit:
 *  - Cari payments dgn status='pending' yg umurnya 1 menit < age < 3 jam
 *    (kasih jeda 1 menit utk Flip checkout asli, dan max 3 jam karena
 *    setelah itu user pasti udh kabur / payment-timeout cron handle).
 *  - Poll Flip/Tripay GET status endpoint.
 *  - Kalau status DONE/SUCCESS -> update payment + booking ke 'paid',
 *    mark sebagai 'searching' supaya cleaner kebagian job.
 *  - Kalau FAILED/CANCELLED/EXPIRED -> mark sesuai.
 *
 * Atomic via WHERE status='pending' supaya gak race dgn webhook callback.
 */
@Injectable()
export class PaymentSyncService {
  private readonly log = new Logger(PaymentSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flip: FlipService,
    private readonly tripay: TripayService,
    private readonly push: PushService,
  ) {}

  // Every 3 minutes (CronExpression.EVERY_3_MINUTES gak ada di nestjs/schedule).
  @Cron('*/3 * * * *')
  async syncPending(): Promise<void> {
    const pending = await this.prisma.$queryRaw<{ id: string; booking_id: string; user_id: string; amount: number; provider: string | null; flip_bill_id: string | null; tripay_merchant_ref: string | null }[]>`
      SELECT id, booking_id, user_id, amount,
             provider, flip_bill_id, tripay_merchant_ref
        FROM payments
       WHERE status = 'pending'
         AND created_at < NOW() - INTERVAL '1 minute'
         AND created_at > NOW() - INTERVAL '3 hours'
       LIMIT 30
    `;
    if (pending.length === 0) return;
    this.log.log(`Syncing ${pending.length} pending payments...`);

    for (const p of pending) {
      try {
        let provider = (p.provider ?? '').toLowerCase();
        if (!provider) {
          provider = p.flip_bill_id ? 'flip' : p.tripay_merchant_ref ? 'tripay' : '';
        }
        let nextStatus: 'paid' | 'failed' | 'expired' | null = null;
        let rawResponse: any = null;

        if (provider === 'flip' && p.flip_bill_id) {
          const result = await this.flip.getAcceptPaymentStatus(p.flip_bill_id);
          if (!result) continue;
          rawResponse = result;
          const status = String(result?.status ?? '').toUpperCase();
          if (status === 'SUCCESSFUL' || status === 'PAID' || status === 'COMPLETED') nextStatus = 'paid';
          else if (status === 'FAILED' || status === 'CANCELLED') nextStatus = 'failed';
          else if (status === 'EXPIRED') nextStatus = 'expired';
        } else if (provider === 'tripay' && p.tripay_merchant_ref) {
          // Tripay punya endpoint GET /transaction/detail?reference=...
          // Tapi method belum ada di TripayService - skip, akan ditambah kalau perlu.
          continue;
        }

        if (!nextStatus) continue;

        // Atomic update payment
        const updated = await this.prisma.$executeRaw`
          UPDATE payments SET status = ${nextStatus},
                              callback_payload = ${JSON.stringify({ ...rawResponse, _source: 'sync-cron' })}::jsonb
           WHERE id = ${p.id}::uuid AND status = 'pending'
        `;
        if (Number(updated) === 0) continue;

        // Kalau paid -> update booking ke 'searching' + paid_at, fire push
        if (nextStatus === 'paid') {
          await this.prisma.$executeRaw`
            UPDATE bookings SET status = 'searching', paid_at = NOW()
             WHERE id = ${p.booking_id}::uuid AND status = 'pending_payment'
          `;
          if (p.user_id) {
            void this.push.send({
              userId: p.user_id, channel: 'booking',
              title: 'Pembayaran berhasil',
              body: `Rp ${Number(p.amount).toLocaleString('id-ID')} ke-konfirmasi. Mencari cleaner...`,
              data: { type: 'payment_completed', bookingId: p.booking_id },
            }).catch(() => {});
          }
        }

        this.log.log(`Synced payment ${p.id}: ${nextStatus} (provider=${provider})`);
      } catch (e: any) {
        this.log.error(`Sync failed for payment ${p.id}: ${e?.message}`);
      }
    }
  }
}
