import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessToken } from 'livekit-server-sdk';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PushService } from '../notifications/push.service';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.warn('[CallModule] LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set — voice call disabled');
}

@ApiTags('call')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('call')
export class CallController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // Initiator (cleaner atau customer) mulai call → dapat token + notif dikirim ke pihak lain
  @Post('start')
  async startCall(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { bookingId: string },
  ) {
    if (!body?.bookingId) throw new BadRequestException('bookingId required');
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      throw new BadRequestException('Fitur telepon belum dikonfigurasi. Hubungi admin.');
    }

    const rows = await this.prisma.$queryRaw<{
      customer_id: string | null;
      cleaner_id: string | null;
      status: string;
    }[]>`
      SELECT customer_id, cleaner_id, status FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new BadRequestException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id && b.cleaner_id !== user.id) {
      throw new BadRequestException('Kamu bukan participant booking ini.');
    }

    const CALLABLE_STATUSES = ['matched', 'on_the_way', 'in_progress'];
    if (!CALLABLE_STATUSES.includes(b.status)) {
      throw new BadRequestException('Telepon hanya bisa dilakukan saat booking sedang berjalan.');
    }

    const isCleaner = b.cleaner_id === user.id;
    const recipientId = isCleaner ? b.customer_id : b.cleaner_id;
    const callerRow = await this.prisma.$queryRaw<{ name: string | null }[]>`
      SELECT name FROM users WHERE id = ${user.id}::uuid LIMIT 1
    `;
    const callerLabel = callerRow[0]?.name ?? (isCleaner ? 'Cleaner' : 'Pelanggan');

    // Token untuk pemanggil
    const token = await generateToken(body.bookingId, user.id);

    // Insert call session — track siapa inisiasi, siapa penerima
    const sessionRows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO call_sessions (booking_id, initiator_id, recipient_id)
      VALUES (${body.bookingId}::uuid, ${user.id}::uuid, ${recipientId}::uuid)
      RETURNING id
    `;
    const sessionId = sessionRows[0]?.id ?? null;

    // Kirim data-only push ke pihak lain — notifee background handler yg buat full-screen notification
    if (recipientId) {
      await this.push.send({
        userId: recipientId,
        channel: 'incoming_call',
        data: {
          type: 'incoming_call',
          bookingId: body.bookingId,
          callerName: callerLabel,
          livekitUrl: LIVEKIT_URL,
        },
      });
    }

    return { token, url: LIVEKIT_URL, roomName: body.bookingId, sessionId };
  }

  // Penerima join room yang sudah ada
  @Post('join')
  async joinCall(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { bookingId: string },
  ) {
    if (!body?.bookingId) throw new BadRequestException('bookingId required');

    const rows = await this.prisma.$queryRaw<{
      customer_id: string | null;
      cleaner_id: string | null;
    }[]>`
      SELECT customer_id, cleaner_id FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new BadRequestException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id && b.cleaner_id !== user.id) {
      throw new BadRequestException('Kamu bukan participant booking ini.');
    }

    // Mark session as answered — ambil session aktif terbaru untuk booking ini
    const sessions = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM call_sessions
       WHERE booking_id = ${body.bookingId}::uuid
         AND ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1
    `;
    const sessionId = sessions[0]?.id ?? null;
    if (sessionId) {
      await this.prisma.$executeRaw`
        UPDATE call_sessions SET answered_at = NOW() WHERE id = ${sessionId}::uuid AND answered_at IS NULL
      `;
    }

    const token = await generateToken(body.bookingId, user.id);
    return { token, url: LIVEKIT_URL, roomName: body.bookingId, sessionId };
  }

  // Akhiri call — update session + insert pesan riwayat ke chat
  @Post('end')
  async endCall(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      bookingId: string;
      sessionId?: string;
      durationSec: number;
      answered: boolean;
      endReason: string;
    },
  ) {
    if (!body?.bookingId) throw new BadRequestException('bookingId required');

    // Find session: pakai sessionId kalau ada, otherwise cari by booking + user
    let sessionId = body.sessionId ?? null;
    if (!sessionId) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM call_sessions
         WHERE booking_id = ${body.bookingId}::uuid
           AND (initiator_id = ${user.id}::uuid OR recipient_id = ${user.id}::uuid)
           AND ended_at IS NULL
         ORDER BY started_at DESC LIMIT 1
      `;
      sessionId = rows[0]?.id ?? null;
    }

    let alreadyEnded = false;
    if (sessionId) {
      const updated = await this.prisma.$executeRaw`
        UPDATE call_sessions
           SET ended_at    = NOW(),
               duration_sec = ${body.durationSec ?? 0},
               end_reason  = ${body.endReason ?? 'hangup'}
         WHERE id = ${sessionId}::uuid AND ended_at IS NULL
      `;
      alreadyEnded = Number(updated) === 0;
    }

    // Insert chat message — skip if session was already ended (prevents duplicate)
    if (!alreadyEnded) {
      const messageType = body.answered ? 'call_ended' : 'call_missed';
      const durationLabel = body.answered && body.durationSec > 0
        ? ` · ${formatDuration(body.durationSec)}`
        : '';
      const content = body.answered
        ? `📞 Panggilan selesai${durationLabel}`
        : '📞 Panggilan tidak diangkat';

      // Cari participant lain untuk recipient_id pesan
      const bRows = await this.prisma.$queryRaw<{ customer_id: string; cleaner_id: string }[]>`
        SELECT customer_id, cleaner_id FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
      `;
      const bk = bRows[0];
      const recipientId = bk
        ? (bk.customer_id === user.id ? bk.cleaner_id : bk.customer_id)
        : null;

      await this.prisma.$executeRaw`
        INSERT INTO chat_messages (booking_id, sender_id, recipient_id, content, message_type)
        VALUES (${body.bookingId}::uuid, ${user.id}::uuid, ${recipientId ?? null}::uuid, ${content}, ${messageType})
      `;
    }

    return { ok: true };
  }
}


async function generateToken(roomName: string, userId: string): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    ttl: '1h',
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  return at.toJwt();
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
