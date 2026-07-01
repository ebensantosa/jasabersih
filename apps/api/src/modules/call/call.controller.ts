import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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

    // Auto-cleanup session yang abandoned (crash / close paksa) lebih dari 5 menit
    await this.prisma.$executeRaw`
      UPDATE call_sessions
         SET ended_at = NOW(), end_reason = 'abandoned'
       WHERE (initiator_id = ${user.id}::uuid OR recipient_id = ${user.id}::uuid)
         AND ended_at IS NULL
         AND started_at < NOW() - INTERVAL '5 minutes'
    `;

    // Cegah duplikat call session aktif untuk user ini
    const activeSession = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM call_sessions
       WHERE (initiator_id = ${user.id}::uuid OR recipient_id = ${user.id}::uuid)
         AND ended_at IS NULL
         AND started_at > NOW() - INTERVAL '10 minutes'
       LIMIT 1
    `;
    if (activeSession.length > 0) {
      throw new BadRequestException('Kamu sedang dalam panggilan lain. Akhiri dulu sebelum memulai panggilan baru.');
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

    // Push dengan title+body supaya Android tampilkan notifikasi + mainkan ringtone call_incoming
    // tanpa bergantung pada Firebase background handler (lebih reliable di semua device).
    if (recipientId) {
      await this.push.send({
        userId: recipientId,
        channel: 'incoming_call',
        title: `📞 ${callerLabel} menelepon`,
        body: 'Tap untuk menerima panggilan',
        data: {
          type: 'incoming_call',
          bookingId: body.bookingId,
          sessionId,
          callerName: callerLabel,
          livekitUrl: LIVEKIT_URL,
        },
      });
    }

    return { token, url: LIVEKIT_URL, roomName: body.bookingId, sessionId };
  }

  @Get('incoming')
  async getIncomingCall(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.prisma.$queryRaw<{
      session_id: string;
      booking_id: string;
      caller_name: string | null;
      started_at: Date;
    }[]>`
      SELECT cs.id AS session_id,
             cs.booking_id::text AS booking_id,
             u.name AS caller_name,
             cs.started_at
        FROM call_sessions cs
        JOIN users u ON u.id = cs.initiator_id
       WHERE cs.recipient_id = ${user.id}::uuid
         AND cs.answered_at IS NULL
         AND cs.ended_at IS NULL
         AND cs.started_at > NOW() - INTERVAL '90 seconds'
       ORDER BY cs.started_at DESC
       LIMIT 1
    `;
    const call = rows[0];
    if (!call) return { active: false };
    return {
      active: true,
      sessionId: call.session_id,
      bookingId: call.booking_id,
      callerName: call.caller_name ?? 'Penelepon',
      startedAt: call.started_at,
    };
  }

  @Get('session-status')
  async getSessionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query('bookingId') bookingId?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    if (!bookingId && !sessionId) throw new BadRequestException('bookingId or sessionId required');

    const rows = await this.prisma.$queryRaw<{
      id: string;
      booking_id: string;
      answered_at: Date | null;
      ended_at: Date | null;
      end_reason: string | null;
      customer_id: string | null;
      cleaner_id: string | null;
    }[]>`
      SELECT cs.id,
             cs.booking_id::text AS booking_id,
             cs.answered_at,
             cs.ended_at,
             cs.end_reason,
             b.customer_id::text AS customer_id,
             b.cleaner_id::text AS cleaner_id
        FROM call_sessions cs
        JOIN bookings b ON b.id = cs.booking_id
       WHERE (${sessionId ?? null}::uuid IS NULL OR cs.id = ${sessionId ?? null}::uuid)
         AND (${bookingId ?? null}::uuid IS NULL OR cs.booking_id = ${bookingId ?? null}::uuid)
       ORDER BY cs.started_at DESC
       LIMIT 1
    `;
    const session = rows[0];
    if (!session) return { exists: false };
    if (session.customer_id !== user.id && session.cleaner_id !== user.id) {
      throw new BadRequestException('Kamu bukan participant panggilan ini.');
    }
    return {
      exists: true,
      sessionId: session.id,
      bookingId: session.booking_id,
      answered: !!session.answered_at,
      ended: !!session.ended_at,
      endReason: session.end_reason ?? null,
    };
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

  @Post('decline')
  async declineCall(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { bookingId: string },
  ) {
    if (!body?.bookingId) throw new BadRequestException('bookingId required');

    const sessions = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
        FROM call_sessions
       WHERE booking_id = ${body.bookingId}::uuid
         AND recipient_id = ${user.id}::uuid
         AND answered_at IS NULL
         AND ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1
    `;
    const sessionId = sessions[0]?.id ?? null;
    if (!sessionId) return { ok: true };

    await this.prisma.$executeRaw`
      UPDATE call_sessions
         SET ended_at = NOW(),
             end_reason = 'declined'
       WHERE id = ${sessionId}::uuid
         AND ended_at IS NULL
    `;

    const initiatorRows = await this.prisma.$queryRaw<{ initiator_id: string | null }[]>`
      SELECT initiator_id::text AS initiator_id
        FROM call_sessions
       WHERE id = ${sessionId}::uuid
       LIMIT 1
    `;
    const initiatorId = initiatorRows[0]?.initiator_id ?? null;
    if (initiatorId) {
      await this.push.send({
        userId: initiatorId,
        data: {
          type: 'incoming_call_cancelled',
          bookingId: body.bookingId,
        },
      }).catch(() => {});
    }

    return { ok: true, sessionId };
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

      if (!body.answered && recipientId) {
        await this.push.send({
          userId: recipientId,
          data: {
            type: 'incoming_call_cancelled',
            bookingId: body.bookingId,
          },
        }).catch(() => {});
      }
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
