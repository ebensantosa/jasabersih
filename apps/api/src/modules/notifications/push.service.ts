import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushPayload = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: 'booking' | 'chat' | 'wallet' | 'system';
  // Kalau diisi, hanya kirim ke device yang mode-nya cocok (cegah notif cleaner masuk ke device customer dan sebaliknya)
  targetMode?: 'customer' | 'freelancer';
};

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  constructor(private readonly prisma: PrismaService) {}

  // Infer targetMode dari data.type kalau caller tidak set explisit.
  // Job/cleaner notif → hanya ke device yg sedang mode freelancer.
  // Booking customer notif → hanya ke device yg sedang mode customer.
  private inferTargetMode(payload: PushPayload): 'customer' | 'freelancer' | null {
    if (payload.targetMode) return payload.targetMode;
    const type = (payload.data as any)?.type ?? '';
    if (['job_available', 'job_assigned', 'job_accepted', 'job_rejected', 'job_completed',
         'kyc_approved', 'kyc_rejected', 'withdrawal_approved', 'withdrawal_rejected',
         'cleaner_inactivity'].some((t) => type.startsWith(t) || type === t)) {
      return 'freelancer';
    }
    if (['booking_matched', 'booking_confirmed', 'booking_completed', 'booking_canceled',
         'booking_created', 'payment_confirmed'].some((t) => type.startsWith(t) || type === t)) {
      return 'customer';
    }
    return null; // system/wallet notif → kirim ke semua mode
  }

  // Send push notif via Expo. Looks up all user_devices.fcm_token rows for userId.
  // Records to notification_logs (sent/failed) + creates notifications row.
  async send(payload: PushPayload): Promise<{ sent: number; failed: number }> {
    const targetMode = this.inferTargetMode(payload);
    const tokens = await this.prisma.$queryRaw<{ fcm_token: string | null }[]>`
      SELECT fcm_token FROM user_devices
       WHERE user_id = ${payload.userId}::uuid
         AND fcm_token IS NOT NULL
         AND fcm_token <> ''
         AND (
           ${targetMode}::text IS NULL
           OR current_mode IS NULL
           OR current_mode = ${targetMode}
         )
    `;
    const validTokens = tokens
      .map((t) => t.fcm_token!)
      .filter((t) => t.startsWith('ExponentPushToken['));

    // Dedup: kalau notif identik (user + type + referenceId) sudah ada di 1 jam terakhir, skip.
    // Covers bookingId, withdrawalId, atau reference lain yg ada di data payload.
    const bookingId = (payload.data as any)?.bookingId;
    const withdrawalId = (payload.data as any)?.withdrawalId;
    const refId = bookingId ?? withdrawalId;
    const notifType = (payload.data as any)?.type ?? payload.channel ?? 'system';
    if (refId) {
      const refKey = bookingId ? 'bookingId' : 'withdrawalId';
      const dup = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM notifications
         WHERE user_id = ${payload.userId}::uuid
           AND data->>'type' = ${notifType}
           AND data->>${refKey} = ${refId}
           AND created_at > NOW() - INTERVAL '1 hour'
      `;
      if ((dup[0]?.c ?? 0) > 0) {
        return { sent: 0, failed: 0, deduped: true } as any;
      }
    }

    // Auto-append short ID ke title biar customer/cleaner bisa bedain notif per-order.
    // Skip kalau title udah include "#xxxx" (sudah di-format di caller).
    let finalTitle = payload.title;
    const shortId = bookingId ? String(bookingId).slice(0, 8) : null;
    if (shortId && !finalTitle.includes('#')) {
      finalTitle = `${finalTitle} · #${shortId}`;
    }

    // Persist in-app notification regardless of token availability
    await this.prisma.$executeRaw`
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (${payload.userId}::uuid, ${payload.channel ?? 'system'}, ${finalTitle}, ${payload.body},
              ${JSON.stringify(payload.data ?? {})}::jsonb)
    `;

    if (validTokens.length === 0) return { sent: 0, failed: 0 };

    const messages = validTokens.map((to) => ({
      to,
      title: finalTitle,
      body: payload.body,
      data: payload.data ?? {},
      sound: 'default' as const,
      channelId: payload.channel ?? 'default',
    }));

    let sent = 0;
    let failed = 0;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: any[] };
      const results = Array.isArray(json.data) ? json.data : [];
      for (let i = 0; i < messages.length; i++) {
        const r = results[i];
        const ok = r?.status === 'ok';
        if (ok) sent++; else failed++;
        await this.prisma.$executeRaw`
          INSERT INTO notification_logs (user_id, channel, template_key, status, external_id, failure_reason)
          VALUES (${payload.userId}::uuid, 'push', ${payload.channel ?? 'system'},
                  ${ok ? 'sent' : 'failed'}, ${r?.id ?? null},
                  ${ok ? null : (r?.message ?? r?.details?.error ?? 'unknown')})
        `;
      }
    } catch (e: any) {
      this.log.error(`expo push failed: ${e?.message}`);
      failed += messages.length;
    }
    return { sent, failed };
  }
}
