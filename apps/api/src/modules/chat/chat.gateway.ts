import { Logger, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { AbuseLimitsService } from '../../common/abuse-limits.service';
import { isAllowedOrigin } from '../../common/cors';
import { PrismaService } from '../../common/prisma.service';
import { JobsGateway } from '../jobs/jobs.gateway';
import { PushService } from '../notifications/push.service';

type AuthedSocket = Socket & { data: { userId: string; role?: string } };

// Auto-block off-platform leak. Each pattern returns reason code + Indonesian
// message yang dishow ke user — biar mereka tau kenapa pesan ke-block.
const BLOCK_PATTERNS: { re: RegExp; reason: string; userMsg: string }[] = [
  // Phone numbers (Indonesia format + various)
  { re: /(\+?62|0)\s?[2-9](?:[\s\-.]?\d){7,11}/, reason: 'phone_number', userMsg: 'Dilarang share nomor HP. Gunakan chat di app aja ya.' },
  // Common Indonesian phone words
  { re: /\b(no\.?\s*hp|nomor\s+hp|no\s+telp|nomor\s+telp|telpon|tlp)\b/i, reason: 'phone_word', userMsg: 'Dilarang minta/share nomor HP. Gunakan chat di app.' },
  // WhatsApp mentions
  { re: /\b(wa|whatsapp|wa\.me|chat\s+wa|nge\-?wa|wha?ts?ap|w[a4]+\s*aj[a4]?)\b/i, reason: 'wa_mention', userMsg: 'Dilarang ajak chat di luar app (WA). Komunikasi harus di JasaBersih.' },
  // Telegram / Line / IG / FB
  { re: /\b(telegram|tele|line\.?me|line\s+id|instagram|ig\s|facebook|fb\.me|messenger)\b/i, reason: 'social_media', userMsg: 'Dilarang ajak komunikasi di sosmed/messenger lain.' },
  // Bank transfer mentions
  { re: /\b(transfer|tf|bca|mandiri|bri|bni|cimb|permata|danamon|jago|seabank|jenius|bukopin|btn|gopay|ovo|dana|shopeepay|qris|virtual\s*account|va\s+\d+)\b/i, reason: 'bank_mention', userMsg: 'Pembayaran HARUS via app — DP/transfer langsung dilarang & berisiko penipuan.' },
  // Off-app deal
  { re: /\b(cash|tunai\s+aja|off\s*app|luar\s+app|di\s*luar|langganan\s+langsung|booking\s+langsung|tanpa\s+app|deal\s+langsung)\b/i, reason: 'off_platform_offer', userMsg: 'Dilarang transaksi di luar app. Order via app dapat asuransi & garansi.' },
  // Email
  { re: /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i, reason: 'email', userMsg: 'Dilarang share email. Komunikasi via app aja.' },
  // External URLs (kecuali jasabersih.com)
  { re: /\b(?!.*jasabersih\.com)(https?:\/\/|www\.)\S+/i, reason: 'external_url', userMsg: 'Dilarang share link eksternal.' },
];

function detectBlockReason(content: string): { reason: string; userMsg: string } | null {
  for (const p of BLOCK_PATTERNS) if (p.re.test(content)) return { reason: p.reason, userMsg: p.userMsg };
  return null;
}

// Allow CORS from admin dashboard + mobile (Expo dev + production scheme)
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, isAllowedOrigin(origin)),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly abuse: AbuseLimitsService,
    private readonly jobsGateway: JobsGateway,
  ) {}

  // Authenticate on connect via JWT token in handshake.auth.token
  async handleConnection(client: AuthedSocket): Promise<void> {
    const token = (client.handshake.auth?.token as string | undefined) ?? (client.handshake.headers?.authorization as string | undefined)?.replace(/^Bearer\s+/, '');
    if (!token) {
      this.log.warn(`socket ${client.id} disconnected: no token`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
      client.data = { userId: payload.sub };
      this.log.log(`socket ${client.id} connected as user ${payload.sub.slice(0, 8)}…`);
    } catch {
      this.log.warn(`socket ${client.id} disconnected: invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    this.log.log(`socket ${client.id} disconnected`);
  }

  // Client joins a booking room — both customer & cleaner harus join.
  // Authorization: cek user adalah customer/cleaner di booking ini.
  @SubscribeMessage('join')
  async onJoin(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { bookingId: string }): Promise<{ ok: boolean; error?: string }> {
    if (!body?.bookingId) return { ok: false, error: 'bookingId required' };

    const rows = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_id: string | null }[]>`
      SELECT customer_id, cleaner_id FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) return { ok: false, error: 'booking not found' };
    if (b.customer_id !== client.data.userId && b.cleaner_id !== client.data.userId) {
      return { ok: false, error: 'not a participant' };
    }

    await client.join(roomName(body.bookingId));
    this.log.log(`user ${client.data.userId.slice(0, 8)}… joined room ${body.bookingId.slice(0, 8)}…`);
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async onLeave(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { bookingId: string }): Promise<{ ok: boolean }> {
    if (!body?.bookingId) return { ok: false };
    await client.leave(roomName(body.bookingId));
    return { ok: true };
  }

  // Send message. Persist + broadcast to room. Auto-block if pattern matched.
  @SubscribeMessage('send')
  async onSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { bookingId: string; content: string; messageType?: 'text' | 'image'; attachmentUrl?: string },
  ): Promise<{ ok: boolean; messageId?: string; blocked?: boolean; blockReason?: string; userMessage?: string; error?: string }> {
    if (!body?.bookingId || !body?.content) return { ok: false, error: 'bookingId & content required' };
    if (body.content.length > 2000) return { ok: false, error: 'message too long (max 2000)' };

    // Verify participant + get recipient
    const rows = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_id: string | null; status: string }[]>`
      SELECT customer_id, cleaner_id, status FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) return { ok: false, error: 'booking not found' };
    if (b.customer_id !== client.data.userId && b.cleaner_id !== client.data.userId) {
      return { ok: false, error: 'not a participant' };
    }
    const recipientId = client.data.userId === b.customer_id ? b.cleaner_id : b.customer_id;

    // Lock chat for completed/canceled bookings unless there's an active dispute
    if (b.status === 'completed' || b.status === 'canceled') {
      const disputes = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM disputes
         WHERE booking_id = ${body.bookingId}::uuid
           AND status NOT IN ('resolved', 'closed')
         LIMIT 1
      `;
      if (disputes.length === 0) {
        return { ok: false, blocked: true, blockReason: 'chat_closed', userMessage: 'Chat sudah ditutup — pesanan selesai.' };
      }
    }

    // Rate limit: max N pesan/menit per user per booking (admin-configurable).
    const limits = await this.abuse.get();
    if (limits.chatMsgPerMin > 0) {
      const cnt = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM chat_messages
         WHERE booking_id = ${body.bookingId}::uuid
           AND sender_id = ${client.data.userId}::uuid
           AND created_at > NOW() - INTERVAL '1 minute'
      `;
      if (Number(cnt[0]?.c ?? 0) >= limits.chatMsgPerMin) {
        return { ok: false, blocked: true, blockReason: 'rate_limit', userMessage: `Terlalu banyak pesan. Tunggu sebentar (max ${limits.chatMsgPerMin}/menit).` };
      }
    }

    // Image message: content = R2 URL (e.g. pub-xxx.r2.dev/chat/...). Pattern
    // external_url akan match URL apapun yg bukan jasabersih.com -> false
    // positive blokir SEMUA foto. Skip pattern check khusus image (presign
    // sudah validasi participant + content-type whitelist di REST endpoint).
    const block = body.messageType === 'image' ? null : detectBlockReason(body.content);
    const status = block ? 'blocked' : 'sent';

    const inserted = await this.prisma.$queryRaw<{ id: string; created_at: Date }[]>`
      INSERT INTO chat_messages (booking_id, sender_id, recipient_id, message_type, content, attachment_url, status, block_reason)
      VALUES (
        ${body.bookingId}::uuid,
        ${client.data.userId}::uuid,
        ${recipientId}::uuid,
        ${body.messageType ?? 'text'},
        ${body.content},
        ${body.attachmentUrl ?? null},
        ${status},
        ${block?.reason ?? null}
      )
      RETURNING id, created_at
    `;
    const msg = inserted[0];

    // Pesan dari user (non-admin) → hapus resolusi supaya thread muncul lagi di inbox admin
    if (status === 'sent') {
      void this.prisma.$executeRaw`
        DELETE FROM chat_resolutions WHERE booking_id = ${body.bookingId}::uuid
      `.catch(() => {});
    }

    // Record fraud strike kalau berulang
    if (block) {
      await this.prisma.$executeRaw`
        INSERT INTO fraud_strikes (user_id, strike_type, reference_id, details)
        VALUES (${client.data.userId}::uuid, 'off_platform_chat', ${msg?.id ?? null}::uuid,
          ${JSON.stringify({ reason: block.reason, snippet: body.content.slice(0, 100) })}::jsonb)
      `;
    }

    // Broadcast to room only if not blocked
    if (!block && msg) {
      this.server.to(roomName(body.bookingId)).emit('message', {
        id: msg.id,
        bookingId: body.bookingId,
        senderId: client.data.userId,
        recipientId,
        messageType: body.messageType ?? 'text',
        content: body.content,
        attachmentUrl: body.attachmentUrl ?? null,
        createdAt: msg.created_at.toISOString(),
      });

      // Signal recipient to refresh unread count via /jobs namespace
      if (recipientId) {
        this.jobsGateway.emitToUser(recipientId, 'chat:unread', { bookingId: body.bookingId });
      }

      // Push notification ke recipient (fire-and-forget)
      if (recipientId) {
        const room = this.server?.sockets?.adapter?.rooms?.get(roomName(body.bookingId));
        const recipientOnline = !!room && Array.from(room).some((sid) => {
          const s = this.server?.sockets?.sockets?.get(sid) as AuthedSocket | undefined;
          return s?.data?.userId === recipientId;
        });
        if (!recipientOnline) {
          const pushBody = body.messageType === 'image'
            ? '📷 Mengirim foto'
            : body.content.length > 80 ? body.content.slice(0, 80) + '…' : body.content;
          void this.push.send({
            userId: recipientId,
            title: 'Pesan baru',
            body: pushBody,
            channel: 'chat',
            data: { type: 'chat', bookingId: body.bookingId },
          }).catch(() => {});
        }
      }
    }

    return {
      ok: true,
      messageId: msg?.id,
      blocked: !!block,
      blockReason: block?.reason,
      userMessage: block?.userMsg,
    };
  }

  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { bookingId: string; typing: boolean }): Promise<void> {
    if (!body?.bookingId) return;
    client.to(roomName(body.bookingId)).emit('typing', { userId: client.data.userId, typing: !!body.typing });
  }

  // Called dari ChatController.markRead() utk push real-time read receipt ke sender.
  broadcastRead(bookingId: string, readerId: string): void {
    this.server.to(roomName(bookingId)).emit('read', { bookingId, readerId, readAt: new Date().toISOString() });
  }

  // Broadcast pesan chat normal dari service lain (mis. call log)
  broadcastChatMessage(payload: {
    id: string;
    bookingId: string;
    senderId: string;
    recipientId: string | null;
    messageType: 'text' | 'image' | 'call_missed' | 'call_ended';
    content: string;
    attachmentUrl?: string | null;
    createdAt: string;
    isAdmin?: boolean;
  }): void {
    this.server.to(roomName(payload.bookingId)).emit('message', {
      id: payload.id,
      bookingId: payload.bookingId,
      senderId: payload.senderId,
      recipientId: payload.recipientId,
      messageType: payload.messageType,
      content: payload.content,
      attachmentUrl: payload.attachmentUrl ?? null,
      createdAt: payload.createdAt,
      isAdmin: !!payload.isAdmin,
    });

    if (payload.recipientId) {
      this.jobsGateway.emitToUser(payload.recipientId, 'chat:unread', { bookingId: payload.bookingId });
    }
  }

  // Called dari AdminChatController.sendMessage() untuk broadcast pesan admin ke room.
  broadcastAdminMessage(payload: { id: string; bookingId: string; senderId: string; recipientId: string; content: string; messageType: 'text' | 'image'; attachmentUrl?: string | null; createdAt: string; isAdmin: true }): void {
    this.broadcastChatMessage({ ...payload, isAdmin: true });
  }
}

function roomName(bookingId: string): string {
  return `booking:${bookingId}`;
}
