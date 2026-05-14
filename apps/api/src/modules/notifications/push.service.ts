import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushPayload = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: 'booking' | 'chat' | 'wallet' | 'system';
};

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  constructor(private readonly prisma: PrismaService) {}

  // Send push notif via Expo. Looks up all user_devices.fcm_token rows for userId.
  // Records to notification_logs (sent/failed) + creates notifications row.
  async send(payload: PushPayload): Promise<{ sent: number; failed: number }> {
    const tokens = await this.prisma.$queryRaw<{ fcm_token: string | null }[]>`
      SELECT fcm_token FROM user_devices
       WHERE user_id = ${payload.userId}::uuid
         AND fcm_token IS NOT NULL
         AND fcm_token <> ''
    `;
    const validTokens = tokens
      .map((t) => t.fcm_token!)
      .filter((t) => t.startsWith('ExponentPushToken['));

    // Dedup: kalau notif identik (user + type + bookingId in data) sudah ada di 1 jam terakhir, skip
    const bookingId = (payload.data as any)?.bookingId;
    const notifType = (payload.data as any)?.type ?? payload.channel ?? 'system';
    if (bookingId) {
      const dup = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM notifications
         WHERE user_id = ${payload.userId}::uuid
           AND data->>'type' = ${notifType}
           AND data->>'bookingId' = ${bookingId}
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
