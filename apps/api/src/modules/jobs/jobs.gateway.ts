import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

type AuthedSocket = Socket & { data: { userId: string } };

const ROOM_AVAILABLE = 'cleaners:available';

@WebSocketGateway({
  namespace: '/jobs',
  cors: {
    origin: (origin: string, cb: (err: Error | null, allow?: boolean) => void) => cb(null, true),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class JobsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(JobsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    const token = (client.handshake.auth?.token as string | undefined)
      ?? (client.handshake.headers?.authorization as string | undefined)?.replace(/^Bearer\s+/, '');
    if (!token) { client.disconnect(true); return; }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
      client.data = { userId: payload.sub };
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    void client.leave(ROOM_AVAILABLE);
  }

  // Cleaner masuk pool available untuk terima broadcast job
  @SubscribeMessage('go-online')
  async goOnline(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: boolean }> {
    // Verify cleaner approved
    const rows = await this.prisma.$queryRaw<{ kyc_status: string | null }[]>`
      SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${client.data.userId}::uuid LIMIT 1
    `;
    if (rows[0]?.kyc_status !== 'approved') return { ok: false };
    await client.join(ROOM_AVAILABLE);
    await this.prisma.$executeRaw`UPDATE cleaner_profiles SET is_available = TRUE WHERE user_id = ${client.data.userId}::uuid`;
    return { ok: true };
  }

  @SubscribeMessage('go-offline')
  async goOffline(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: boolean }> {
    await client.leave(ROOM_AVAILABLE);
    await this.prisma.$executeRaw`UPDATE cleaner_profiles SET is_available = FALSE WHERE user_id = ${client.data.userId}::uuid`;
    return { ok: true };
  }

  // Cleaner accept job — first-come-first-served (atomic)
  @SubscribeMessage('accept-job')
  async acceptJob(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { bookingId: string }): Promise<{ ok: boolean; error?: string }> {
    if (!body?.bookingId) return { ok: false, error: 'bookingId required' };
    const userId = client.data.userId;

    // Atomic: only assign if cleaner_id IS NULL (race-safe). Returns 0 if already taken.
    const updated = await this.prisma.$executeRaw`
      UPDATE bookings
         SET cleaner_id = ${userId}::uuid, status = 'matched', matched_at = NOW()
       WHERE id = ${body.bookingId}::uuid
         AND cleaner_id IS NULL
         AND status = 'searching'
    `;
    if (Number(updated) === 0) {
      return { ok: false, error: 'Job sudah diambil cleaner lain' };
    }

    // Get customer + service
    const b = await this.prisma.$queryRaw<{ customer_id: string; service_name: string | null }[]>`
      SELECT b.customer_id, s.name AS service_name FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = ${body.bookingId}::uuid LIMIT 1
    `;
    const customerId = b[0]?.customer_id;

    // Notify other cleaners that job is taken (so modal closes)
    this.server.to(ROOM_AVAILABLE).emit('job-taken', { bookingId: body.bookingId, by: userId });
    // Notify customer
    if (customerId) {
      void this.push.send({
        userId: customerId, channel: 'booking',
        title: 'Cleaner ditemukan! 🎉',
        body: 'Cleaner kamu sudah konfirmasi & akan menuju lokasi.',
        data: { type: 'booking_matched', bookingId: body.bookingId },
      }).catch(() => {});
    }
    return { ok: true };
  }

  // Called by services (PaymentsController, BookingsController) saat status → searching
  async broadcastIncomingJob(bookingId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt", b.total_amount AS "totalAmount",
             b.cleaner_payout AS "cleanerPayout",
             s.name AS "serviceName"
        FROM bookings b LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = ${bookingId}::uuid AND b.status = 'searching' AND b.cleaner_id IS NULL LIMIT 1
    `;
    if (!rows[0]) return;
    this.server.to(ROOM_AVAILABLE).emit('incoming-job', rows[0]);
    this.log.log(`broadcast incoming-job ${bookingId} to ${this.server.sockets.adapter.rooms.get(ROOM_AVAILABLE)?.size ?? 0} cleaners`);
  }
}
