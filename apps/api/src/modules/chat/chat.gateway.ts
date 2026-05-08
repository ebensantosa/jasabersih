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

import { PrismaService } from '../../common/prisma.service';

type AuthedSocket = Socket & { data: { userId: string; role?: string } };

// Same keywords as fraud detection — auto-block off-platform leak
const BLOCK_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /(0[2-9]\d{8,11})/, reason: 'phone_number' },
  { re: /\b(wa|whatsapp|wa\.me|chat\s+wa)\b/i, reason: 'wa_mention' },
  { re: /\b(transfer|tf|bca|mandiri|bri|bni)\b/i, reason: 'bank_mention' },
  { re: /\b(cash|tunai\s+aja|off\s*app|luar\s+app)\b/i, reason: 'off_platform_offer' },
];

function detectBlockReason(content: string): string | null {
  for (const p of BLOCK_PATTERNS) if (p.re.test(content)) return p.reason;
  return null;
}

// Allow CORS from admin dashboard + mobile (Expo dev + production scheme)
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: (origin: string, cb: (err: Error | null, allow?: boolean) => void) => cb(null, true),
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
  ): Promise<{ ok: boolean; messageId?: string; blocked?: boolean; blockReason?: string; error?: string }> {
    if (!body?.bookingId || !body?.content) return { ok: false, error: 'bookingId & content required' };
    if (body.content.length > 2000) return { ok: false, error: 'message too long (max 2000)' };

    // Verify participant + get recipient
    const rows = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_id: string | null }[]>`
      SELECT customer_id, cleaner_id FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) return { ok: false, error: 'booking not found' };
    if (b.customer_id !== client.data.userId && b.cleaner_id !== client.data.userId) {
      return { ok: false, error: 'not a participant' };
    }
    const recipientId = client.data.userId === b.customer_id ? b.cleaner_id : b.customer_id;

    const blockReason = detectBlockReason(body.content);
    const status = blockReason ? 'blocked' : 'sent';

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
        ${blockReason}
      )
      RETURNING id, created_at
    `;
    const msg = inserted[0];

    // Broadcast to room only if not blocked
    if (!blockReason && msg) {
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
    }

    return { ok: true, messageId: msg?.id, blocked: !!blockReason, blockReason: blockReason ?? undefined };
  }

  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { bookingId: string; typing: boolean }): Promise<void> {
    if (!body?.bookingId) return;
    client.to(roomName(body.bookingId)).emit('typing', { userId: client.data.userId, typing: !!body.typing });
  }
}

function roomName(bookingId: string): string {
  return `booking:${bookingId}`;
}
