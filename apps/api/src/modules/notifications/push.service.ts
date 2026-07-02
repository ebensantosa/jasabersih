import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushPayload = {
  userId: string;
  title?: string;  // optional: kalau kosong → data-only push (tidak muncul di tray, dihandle notifee)
  body?: string;
  data?: Record<string, unknown>;
  channel?: 'booking' | 'chat' | 'wallet' | 'system' | 'incoming_job' | 'incoming_job_v2' | 'incoming_call';
  targetMode?: 'customer' | 'freelancer';
};

function resolvePushAudio(channel?: PushPayload['channel']): { sound: string; channelId: string } {
  switch (channel) {
    case 'chat':
      return { sound: 'chat_message', channelId: 'chat_v3' };
    case 'incoming_call':
      return { sound: 'call_incoming.wav', channelId: 'incoming_call_v2' };
    case 'incoming_job':
    case 'incoming_job_v2':
      return { sound: 'order_incoming.wav', channelId: 'incoming_job_v2' };
    default:
      return { sound: 'default', channelId: channel ?? 'default' };
  }
}

export type PushBatchItem = {
  userId: string;
  title: string;
  body: string;
  channel: 'booking' | 'chat' | 'wallet' | 'system' | 'incoming_job' | 'incoming_job_v2';
  data: Record<string, unknown>;
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

    this.log.log(`send user=${payload.userId} type=${(payload.data as any)?.type ?? '-'} targetMode=${targetMode ?? 'null'} rawTokens=${tokens.length} validTokens=${validTokens.length}`);

    // Dedup hanya untuk event status yang memang 1x per reference.
    // Chat harus selalu masuk supaya tiap pesan tetap memicu notifikasi.
    const bookingId = (payload.data as any)?.bookingId;
    const withdrawalId = (payload.data as any)?.withdrawalId;
    const refId = bookingId ?? withdrawalId;
    const notifType = (payload.data as any)?.type ?? payload.channel ?? 'system';
    const dedupEligible = new Set([
      'booking_matched',
      'booking_confirmed',
      'booking_completed',
      'booking_canceled',
      'payment_confirmed',
      'payment_paid',
      'payment_completed',
      'payment_underpaid',
      'hourly_timer_expired',
      'auto_completed',
      'overtime_paid',
      'upcharge_requested',
      'upcharge_approved',
      'upcharge_rejected',
      'extension_requested',
      'extension_accepted',
      'extension_declined',
      'helper_invited',
      'helper_accepted',
      'helper_declined',
      'reclean_requested',
      'reclean_accepted',
      'reclean_rejected',
      'rating_reminder',
      'cleaner_reminder',
      'customer_reminder',
      'job_assigned',
      'wallet_credit',
      'withdrawal_approved',
      'withdrawal_rejected',
      'withdrawal_completed',
      'withdrawal_failed',
      'withdrawal_pending_maintenance',
      'rating_received',
      'earnings_cleared',
    ]);
    // incoming_call & chat tidak di-dedup — setiap panggilan / pesan adalah event baru
    if (refId && notifType !== 'incoming_call' && notifType !== 'chat' && dedupEligible.has(notifType)) {
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
    let finalTitle: string = payload.title ?? '';
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

    const isDataOnly = !payload.title && !payload.body;
    const { sound, channelId } = resolvePushAudio(payload.channel);
    const messages = validTokens.map((to) => ({
      to,
      // Data-only push: tidak ada title/body → Android tidak auto-show notif, diserahkan ke notifee background handler
      ...(isDataOnly ? {} : { title: finalTitle, body: payload.body, sound, channelId }),
      data: payload.data ?? {},
      priority: 'high' as const,
      // content_available supaya iOS + Android wake up background handler
      _contentAvailable: true,
    }));

    let sent = 0;
    let failed = 0;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const rawText = await res.text().catch(() => '');
      let json: { data?: any[]; errors?: any[] } = {};
      try { json = JSON.parse(rawText); } catch { /* ignore */ }

      // PUSH_TOO_MANY_EXPERIENCE_IDS: tokens dari beberapa Expo project dicampur.
      // Solusi: retry tiap group experience secara terpisah.
      const tooManyExp = json.errors?.find((e: any) => e?.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS');
      if (tooManyExp) {
        const groups: Record<string, string[]> = tooManyExp.details ?? {};
        this.log.warn(`PUSH_TOO_MANY_EXPERIENCE_IDS — retrying ${Object.keys(groups).length} groups separately`);
        for (const [exp, groupTokens] of Object.entries(groups)) {
          const groupMessages = messages.filter((m) => groupTokens.includes(m.to));
          if (groupMessages.length === 0) continue;
          try {
            const r2 = await fetch(EXPO_PUSH_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify(groupMessages),
            });
            const j2 = await r2.json().catch(() => ({})) as { data?: any[] };
            const res2 = Array.isArray(j2.data) ? j2.data : [];
            const ok = res2.filter((r: any) => r?.status === 'ok').length;
            sent += ok; failed += groupMessages.length - ok;
            this.log.log(`retry group ${exp}: sent=${ok}/${groupMessages.length}`);
            // Cleanup expired tokens dalam group ini
            const expired = res2
              .map((r: any, i: number) => ({ r, token: groupMessages[i]?.to }))
              .filter(({ r }) => r?.details?.error === 'DeviceNotRegistered' || r?.details?.error === 'InvalidCredentials')
              .map(({ token }) => token).filter(Boolean) as string[];
            if (expired.length > 0) {
              void Promise.all(expired.map((t) =>
                this.prisma.$executeRaw`DELETE FROM user_devices WHERE fcm_token = ${t}`.catch(() => {}),
              ));
            }
          } catch (e2: any) {
            this.log.error(`retry group ${exp} failed: ${e2?.message}`);
            failed += groupMessages.length;
          }
        }
        return { sent, failed };
      }

      const results = Array.isArray(json.data) ? json.data : [];
      if (!Array.isArray(json.data) || results.length === 0) {
        this.log.warn(`expo push unexpected response: status=${res.status} body=${rawText.slice(0, 500)}`);
      }
      for (let i = 0; i < messages.length; i++) {
        const r = results[i];
        if (r?.status === 'ok') sent++; else failed++;
      }
      this.log.log(`send expo response: sent=${sent} failed=${failed} raw=${JSON.stringify(results).slice(0, 300)}`);
      // Log failures + auto-cleanup DeviceNotRegistered tokens
      const failedResults = results
        .map((r, i) => ({ r, token: messages[i]?.to }))
        .filter(({ r }) => r?.status !== 'ok');
      if (failedResults.length > 0) {
        void Promise.all(failedResults.map(({ r, token }) => {
          const isExpired = r?.details?.error === 'DeviceNotRegistered' || r?.details?.error === 'InvalidCredentials';
          return Promise.all([
            this.prisma.$executeRaw`
              INSERT INTO notification_logs (user_id, channel, template_key, status, external_id, failure_reason)
              VALUES (${payload.userId}::uuid, 'push', ${payload.channel ?? 'system'},
                      'failed', ${r?.id ?? null},
                      ${r?.message ?? r?.details?.error ?? 'unknown'})
            `.catch(() => {}),
            isExpired && token
              ? this.prisma.$executeRaw`DELETE FROM user_devices WHERE fcm_token = ${token}`.catch(() => {})
              : Promise.resolve(),
          ]);
        }));
      }
    } catch (e: any) {
      this.log.error(`expo push failed: ${e?.message}`);
      failed += messages.length;
    }
    return { sent, failed };
  }

  // Kirim FCM ke banyak user sekaligus dengan minimal DB round-trips:
  // 1 query token + 1 dedup check + 1 notif insert per user (parallel) + 1 Expo HTTP per 100 msg.
  // Jauh lebih efisien dari N kali send() untuk broadcast ke banyak cleaner.
  async sendBatch(items: PushBatchItem[]): Promise<void> {
    if (items.length === 0) return;

    const firstItem = items[0]!;
    const userIds = items.map((i) => i.userId);
    const notifType = String((firstItem.data as any)?.type ?? 'system');
    const bookingId = (firstItem.data as any)?.bookingId as string | undefined;

    // ── 1. Dedup: satu query untuk semua user ──────────────────────────────
    const dedupedUsers = new Set<string>();
    if (bookingId) {
      const dupRows = await this.prisma.$queryRaw<{ user_id: string }[]>`
        SELECT DISTINCT user_id::text FROM notifications
         WHERE user_id = ANY(${userIds}::uuid[])
           AND data->>'type' = ${notifType}
           AND data->>'bookingId' = ${bookingId}
           AND created_at > NOW() - INTERVAL '1 hour'
      `.catch(() => []);
      dupRows.forEach((r) => dedupedUsers.add(r.user_id));
    }

    const eligible = items.filter((i) => !dedupedUsers.has(i.userId));
    if (eligible.length === 0) return;

    const eligibleUserIds = eligible.map((i) => i.userId);
    const targetMode = eligible[0]!.targetMode ?? null;

    // ── 2. Tokens: satu query untuk semua user ─────────────────────────────
    const tokenRows = await this.prisma.$queryRaw<{ user_id: string; fcm_token: string }[]>`
      SELECT user_id::text, fcm_token FROM user_devices
       WHERE user_id = ANY(${eligibleUserIds}::uuid[])
         AND fcm_token IS NOT NULL
         AND fcm_token <> ''
         AND (
           ${targetMode}::text IS NULL
           OR current_mode IS NULL
           OR current_mode = ${targetMode}
         )
    `.catch(() => []);

    const validTokens = tokenRows.filter((r) => r.fcm_token.startsWith('ExponentPushToken['));

    // ── 3. Persist in-app notifications (parallel, non-blocking for push) ──
    const itemMap = new Map(eligible.map((i) => [i.userId, i]));
    void Promise.all(
      eligible.map((item) =>
        this.prisma.$executeRaw`
          INSERT INTO notifications (user_id, type, title, body, data)
          VALUES (${item.userId}::uuid, ${item.channel}, ${item.title}, ${item.body},
                  ${JSON.stringify(item.data)}::jsonb)
        `.catch(() => {}),
      ),
    );

    if (validTokens.length === 0) return;

    // ── 4. Satu Expo HTTP call per 100 token ───────────────────────────────
    const messages = validTokens.map((r) => {
      const item = itemMap.get(r.user_id) ?? eligible[0]!;
      const { sound, channelId } = resolvePushAudio(item.channel);
      return {
        to: r.fcm_token,
        title: item.title,
        body: item.body,
        data: item.data,
        sound,
        channelId,
        priority: 'high' as const,
      };
    });

    this.log.log(`sendBatch: ${validTokens.length} valid tokens for ${eligible.length} users`);
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch),
      }).catch((e: any) => { this.log.error(`expo batch push failed: ${e?.message}`); return null; });
      if (res) {
        const json = await res.json().catch(() => ({})) as { data?: any[] };
        const results = Array.isArray(json.data) ? json.data : [];
        const failed = results.filter((r) => r?.status !== 'ok');
        if (failed.length > 0) {
          this.log.warn(`sendBatch expo errors: ${JSON.stringify(failed)}`);
          // Auto-cleanup expired tokens
          const expiredTokens = results
            .map((r, idx) => ({ r, token: batch[idx]?.to }))
            .filter(({ r }) => r?.details?.error === 'DeviceNotRegistered' || r?.details?.error === 'InvalidCredentials')
            .map(({ token }) => token)
            .filter(Boolean) as string[];
          if (expiredTokens.length > 0) {
            void Promise.all(expiredTokens.map((t) =>
              this.prisma.$executeRaw`DELETE FROM user_devices WHERE fcm_token = ${t}`.catch(() => {}),
            ));
            this.log.log(`sendBatch cleanup: removed ${expiredTokens.length} expired tokens`);
          }
        } else this.log.log(`sendBatch ok: ${results.length} sent`);
      }
    }
  }
}
