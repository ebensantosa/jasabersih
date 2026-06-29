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
    const callerLabel = isCleaner ? 'Cleaner' : 'Customer';

    // Token untuk pemanggil
    const token = await generateToken(body.bookingId, user.id);

    // Kirim push notif ke pihak lain
    if (recipientId) {
      await this.push.send({
        userId: recipientId,
        title: `📞 ${callerLabel} mengajak kamu telepon`,
        body: 'Tap untuk angkat panggilan',
        channel: 'booking',
        data: {
          type: 'incoming_call',
          bookingId: body.bookingId,
          callerName: user.id,
          livekitUrl: LIVEKIT_URL,
        },
      });
    }

    return { token, url: LIVEKIT_URL, roomName: body.bookingId };
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

    const token = await generateToken(body.bookingId, user.id);
    return { token, url: LIVEKIT_URL, roomName: body.bookingId };
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
