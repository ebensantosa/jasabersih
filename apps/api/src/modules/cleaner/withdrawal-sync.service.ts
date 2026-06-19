import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma.service';
import { FlipService } from '../payments/flip.service';
import { PushService } from '../notifications/push.service';

/**
 * Self-heal withdrawal status kalau Flip callback gagal/telat.
 *
 * Tiap 5 menit:
 *  - Cari withdrawals dgn status='processing' yg punya flip_disbursement_id.
 *  - Polling Flip GET /get-disbursement utk dapat status terkini.
 *  - Kalau status server beda dgn lokal -> update + clear hold ledger
 *    (sama logic dgn webhook callback).
 *
 * Hindari race dgn webhook (idempotent): UPDATE pakai WHERE status='processing'
 * supaya kalau webhook udh update duluan, kita skip.
 */
@Injectable()
export class WithdrawalSyncService {
  private readonly log = new Logger(WithdrawalSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flip: FlipService,
    private readonly push: PushService,
  ) {}

  // Tiap 1 menit fallback - kalau webhook disbursement gagal terkirim,
  // status tetep ke-update dalam <=1 menit. Atomic UPDATE prevent
  // duplicate notif kalau webhook + cron sync paralel.
  @Cron('0 * * * * *')
  async syncPending(): Promise<void> {
    const pending = await this.prisma.$queryRaw<{ id: string; user_id: string; amount: number; flip_disbursement_id: string }[]>`
      SELECT id, user_id, amount, flip_disbursement_id
        FROM withdrawals
       WHERE status = 'processing'
         AND flip_disbursement_id IS NOT NULL
         AND flip_disbursement_id <> ''
         AND requested_at > NOW() - INTERVAL '7 days'
       LIMIT 50
    `;
    if (pending.length === 0) return;
    this.log.log(`Syncing ${pending.length} pending withdrawals from Flip...`);

    for (const w of pending) {
      try {
        const result = await this.flip.getDisbursementStatus(w.flip_disbursement_id);
        if (!result) continue;
        const statusRaw = String(result?.status ?? '').toUpperCase();
        const next = statusRaw === 'DONE' ? 'completed'
          : statusRaw === 'CANCELLED' ? 'canceled'
          : statusRaw === 'FAILED' ? 'failed'
          : null;
        if (!next) continue; // Masih PENDING di Flip - skip

        const failureReason = next === 'failed' || next === 'canceled'
          ? String(result?.failure_reason ?? result?.reason ?? `Flip status ${statusRaw}`)
          : null;

        // Atomic: cuma update kalau masih 'processing' (hindari race dgn webhook)
        const updated = await this.prisma.$executeRaw`
          UPDATE withdrawals
             SET status = ${next},
                 callback_payload = ${JSON.stringify({ ...result, _source: 'sync-cron' })}::jsonb,
                 failure_reason = ${failureReason},
                 processed_at = CASE WHEN ${next} = 'completed' THEN NOW() ELSE processed_at END
           WHERE id = ${w.id}::uuid AND status = 'processing'
        `;
        if (Number(updated) === 0) continue; // race lost - webhook udh update

        // Clear hold ledger entries
        await this.prisma.$executeRaw`
          UPDATE wallet_ledger_entries SET status = 'CLEARED', cleared_at = NOW()
           WHERE reference_type = 'withdrawal' AND reference_id = ${w.id}::uuid AND status = 'PENDING'
        `;

        // Reverse kalau gagal/cancel -> kembalikan saldo
        if (next === 'failed' || next === 'canceled') {
          await this.prisma.$executeRaw`
            INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
            VALUES (${w.user_id}::uuid, 'withdrawal', ${-w.amount}::bigint, 'withdrawal_reverse', ${w.id}::uuid, 'CLEARED', 'Reverse: sync ' || ${next})
          `;
        }

        // Notify cleaner
        if (w.user_id) {
          const title = next === 'completed' ? 'Penarikan berhasil'
            : next === 'failed' ? 'Penarikan gagal'
            : 'Penarikan dibatalkan';
          const body = next === 'completed'
            ? `Rp ${Number(w.amount).toLocaleString('id-ID')} sudah ditransfer ke rekening kamu.`
            : `Rp ${Number(w.amount).toLocaleString('id-ID')} dikembalikan ke saldo.${failureReason ? ` Alasan: ${failureReason}` : ''}`;
          void this.push.send({
            userId: w.user_id, channel: 'wallet', title, body,
            data: { type: `withdrawal_${next}`, withdrawalId: w.id },
          }).catch(() => {});
        }

        this.log.log(`Synced withdrawal ${w.id}: ${next} (Flip status: ${statusRaw})`);
      } catch (e: any) {
        this.log.error(`Sync failed for withdrawal ${w.id}: ${e?.message}`);
      }
    }
  }
}
