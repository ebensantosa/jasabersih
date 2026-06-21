import { Logger } from '@nestjs/common';
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

import { isAllowedOrigin } from '../../common/cors';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

type AuthedSocket = Socket & { data: { userId: string } };

const ROOM_AVAILABLE = 'cleaners:available';

@WebSocketGateway({
  namespace: '/jobs',
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, isAllowedOrigin(origin)),
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
    if (!token) {
      client.disconnect(true);
      return;
    }
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

  @SubscribeMessage('go-online')
  async goOnline(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: boolean; error?: string; code?: string }> {
    const userRow = await this.prisma.$queryRaw<{ status: string | null; suspended_until: Date | null }[]>`
      SELECT status, suspended_until FROM users WHERE id = ${client.data.userId}::uuid LIMIT 1
    `;
    const u = userRow[0];
    if (u?.status === 'suspended' && (!u.suspended_until || new Date(u.suspended_until).getTime() > Date.now())) {
      return { ok: false, error: 'Akun kamu sedang di-suspend', code: 'USER_SUSPENDED' };
    }
    if (u?.status === 'banned') {
      return { ok: false, error: 'Akun kamu di-banned', code: 'USER_BANNED' };
    }
    const rows = await this.prisma.$queryRaw<{ kyc_status: string | null }[]>`
      SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${client.data.userId}::uuid LIMIT 1
    `;
    if (rows[0]?.kyc_status !== 'approved') {
      return { ok: false, error: 'KYC belum approved', code: 'KYC_NOT_APPROVED' };
    }

    const photoRow = await this.prisma.$queryRaw<{ photo_url: string | null }[]>`
      SELECT photo_url FROM users WHERE id = ${client.data.userId}::uuid LIMIT 1
    `;
    if (!photoRow[0]?.photo_url) {
      return { ok: false, error: 'Upload foto profil dulu sebelum bisa online', code: 'NEED_PROFILE_PHOTO' };
    }

    await client.join(ROOM_AVAILABLE);
    await this.prisma.$executeRaw`
      UPDATE cleaner_profiles
         SET is_available = TRUE
       WHERE user_id = ${client.data.userId}::uuid
    `;
    return { ok: true };
  }

  @SubscribeMessage('go-offline')
  async goOffline(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: boolean }> {
    await client.leave(ROOM_AVAILABLE);
    await this.prisma.$executeRaw`
      UPDATE cleaner_profiles
         SET is_available = FALSE
       WHERE user_id = ${client.data.userId}::uuid
    `;
    return { ok: true };
  }

  @SubscribeMessage('accept-job')
  async acceptJob(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { bookingId: string },
  ): Promise<{ ok: boolean; error?: string }> {
    if (!body?.bookingId) return { ok: false, error: 'bookingId required' };
    const userId = client.data.userId;

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

    const bookingRows = await this.prisma.$queryRaw<{ customer_id: string }[]>`
      SELECT customer_id
        FROM bookings
       WHERE id = ${body.bookingId}::uuid
       LIMIT 1
    `;
    const customerId = bookingRows[0]?.customer_id;

    this.server.to(ROOM_AVAILABLE).emit('job-taken', { bookingId: body.bookingId, by: userId });

    if (customerId) {
      void this.push.send({
        userId: customerId,
        channel: 'booking',
        title: 'Cleaner ditemukan',
        body: 'Cleaner sudah konfirmasi dan akan menuju lokasi.',
        data: { type: 'booking_matched', bookingId: body.bookingId },
      }).catch(() => {});
    }

    return { ok: true };
  }

  getCleanerPoolSize(): number {
    return this.server?.sockets?.adapter?.rooms?.get(ROOM_AVAILABLE)?.size ?? 0;
  }

  async broadcastIncomingJob(bookingId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<{
      id: string;
      pricingMode: string;
      addressLine: string;
      scheduledAt: Date;
      createdAt: Date;
      totalAmount: number;
      cleanerPayout: number | null;
      serviceName: string | null;
      serviceIconUrl: string | null;
      packageName: string | null;
      hourlyTierName: string | null;
      hours: number | null;
      customerNotes: string | null;
      formSnapshot: any;
    }[]>`
      SELECT b.id,
             b.pricing_mode AS "pricingMode",
             b.address_line AS "addressLine",
             b.scheduled_at AS "scheduledAt",
             b.created_at AS "createdAt",
             b.total_amount AS "totalAmount",
             b.cleaner_payout AS "cleanerPayout",
             COALESCE(s.name, pp.name, NULLIF(b.form_snapshot->>'packageName', ''), NULLIF(b.form_snapshot->>'categoryName', ''), 'Layanan') AS "serviceName",
             s.icon_url AS "serviceIconUrl",
             pp.name AS "packageName",
             ht.name AS "hourlyTierName",
             b.hours_booked AS "hours",
             b.customer_notes AS "customerNotes",
             b.form_snapshot AS "formSnapshot"
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN pricing_packages pp ON pp.id = b.package_id
        LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
       WHERE b.id = ${bookingId}::uuid
         AND b.status = 'searching'
         AND b.cleaner_id IS NULL
       LIMIT 1
    `;
    if (!rows[0]) return;
    const job = rows[0];

    // Estimasi cleaner_payout — kolom asli baru di-set saat cleaner accept.
    // Pakai commission_tiers no_tools share (lebih konservatif = aman).
    if (!job.cleanerPayout || Number(job.cleanerPayout) <= 0) {
      const tiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number }[]>`
        SELECT range_min, range_max, cleaner_share_no_tools
          FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
      `.catch(() => [] as any[]);
      const total = Number(job.totalAmount ?? 0);
      const tier = tiers.find((t) => total >= Number(t.range_min ?? 0) && (t.range_max == null || total <= Number(t.range_max)));
      const pct = Number(tier?.cleaner_share_no_tools ?? 40);
      job.cleanerPayout = Math.round(total * pct / 100);
    }

    const { totalAmount: _hidden, ...jobForCleaner } = job;
    this.server.to(ROOM_AVAILABLE).emit('incoming-job', jobForCleaner);
    const onlineCount = this.server.sockets.adapter.rooms.get(ROOM_AVAILABLE)?.size ?? 0;

    const normalizedAddress = String(job.addressLine ?? '').toLowerCase();
    const cleaners = await this.prisma.$queryRaw<{ user_id: string; service_areas: unknown }[]>`
      SELECT cp.user_id, cp.service_areas
        FROM cleaner_profiles cp
        JOIN users u ON u.id = cp.user_id
       WHERE cp.kyc_status = 'approved'
         AND COALESCE(cp.is_available, TRUE) = TRUE
         AND u.deleted_at IS NULL
       LIMIT 100
    `.catch(() => [] as { user_id: string; service_areas: unknown }[]);

    const eligibleCleaners = cleaners.filter((cleaner) => {
      const areas = Array.isArray(cleaner.service_areas)
        ? cleaner.service_areas
            .filter((area): area is string => typeof area === 'string')
            .map((area) => area.trim().toLowerCase())
            .filter(Boolean)
        : [];
      if (areas.length === 0) return false;
      return areas.some((area) => normalizedAddress.includes(area));
    });

    const payout = Number(job.cleanerPayout ?? 0);
    const title = `Job baru: ${job.serviceName ?? 'Layanan'}`;
    const body = `${payout > 0 ? `Pendapatan Rp ${payout.toLocaleString('id-ID')} · ` : ''}${job.addressLine.split(',').slice(0, 2).join(',')}`;

    await Promise.all(
      eligibleCleaners.map((cleaner) =>
        this.push.send({
          userId: cleaner.user_id,
          channel: 'booking',
          title,
          body,
          data: { type: 'incoming_job', bookingId },
        }).catch(() => {}),
      ),
    );

    this.log.log(`broadcast incoming-job ${bookingId} -> socket=${onlineCount} push=${eligibleCleaners.length}`);
  }
}
