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
  async goOnline(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: boolean; error?: string; code?: string }> {
    // Verify cleaner approved
    const rows = await this.prisma.$queryRaw<{ kyc_status: string | null }[]>`
      SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${client.data.userId}::uuid LIMIT 1
    `;
    if (rows[0]?.kyc_status !== 'approved') return { ok: false, error: 'KYC belum approved', code: 'KYC_NOT_APPROVED' };
    // Gate: butuh foto profil
    const photoRow = await this.prisma.$queryRaw<{ photo_url: string | null }[]>`
      SELECT photo_url FROM users WHERE id = ${client.data.userId}::uuid LIMIT 1
    `;
    if (!photoRow[0]?.photo_url) {
      return { ok: false, error: 'Upload foto profil dulu sebelum bisa online', code: 'NEED_PROFILE_PHOTO' };
    }
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

  /** Berapa cleaner online di pool available room (for searching stats). */
  getCleanerPoolSize(): number {
    return this.server?.sockets?.adapter?.rooms?.get(ROOM_AVAILABLE)?.size ?? 0;
  }

  // Called by services (PaymentsController, BookingsController) saat status → searching.
  // Dual delivery: socket.io ke cleaner yang lagi online (realtime UI update) +
  // push notif ke SEMUA approved cleaner yang lagi available (Gojek-style — bunyi
  // di lockscreen meski app closed).
  async broadcastIncomingJob(bookingId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ id: string; pricingMode: string; addressLine: string; scheduledAt: Date; totalAmount: number; cleanerPayout: number | null; serviceName: string | null }[]>`
      SELECT b.id, b.pricing_mode AS "pricingMode", b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt", b.total_amount AS "totalAmount",
             b.cleaner_payout AS "cleanerPayout",
             s.name AS "serviceName"
        FROM bookings b LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = ${bookingId}::uuid AND b.status = 'searching' AND b.cleaner_id IS NULL LIMIT 1
    `;
    if (!rows[0]) return;
    const job = rows[0];

    // Realtime socket broadcast — strip totalAmount (cleaner gak perlu tau harga asli)
    const { totalAmount: _hidden, ...jobForCleaner } = job;
    this.server.to(ROOM_AVAILABLE).emit('incoming-job', jobForCleaner);
    const onlineCount = this.server.sockets.adapter.rooms.get(ROOM_AVAILABLE)?.size ?? 0;

    // Push notif blast ke approved + available cleaners (max 50 per broadcast).
    // Filter coverage area di /cleaner/jobs/available, jadi notif boleh blast
    // semua approved — biar cepat response.
    const cleaners = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT cp.user_id
        FROM cleaner_profiles cp
        JOIN users u ON u.id = cp.user_id
       WHERE cp.kyc_status = 'approved'
         AND COALESCE(cp.is_available, TRUE) = TRUE
         AND u.deleted_at IS NULL
       LIMIT 50
    `.catch(() => [] as { user_id: string }[]);

    const payout = Number(job.cleanerPayout ?? 0);
    const title = `Job baru: ${job.serviceName ?? 'Layanan'}`;
    // Hanya tampilkan share cleaner, bukan total customer bayar.
    const body = `${payout > 0 ? `Bagianmu Rp ${payout.toLocaleString('id-ID')} · ` : ''}${job.addressLine.split(',').slice(0, 2).join(',')}`;

    await Promise.all(
      cleaners.map((c) =>
        this.push.send({
          userId: c.user_id, channel: 'booking',
          title, body,
          data: { type: 'incoming_job', bookingId },
        }).catch(() => {}),
      ),
    );

    this.log.log(`broadcast incoming-job ${bookingId} → socket=${onlineCount} push=${cleaners.length}`);
  }
}
