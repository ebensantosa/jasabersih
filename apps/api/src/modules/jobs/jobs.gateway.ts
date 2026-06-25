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

  // Commission tiers in-memory cache — refreshed every 5 min (rarely changes)
  private commissionCache: { data: { range_min: number | null; range_max: number | null; cleaner_share_no_tools: number }[]; ts: number } | null = null;
  private readonly COMMISSION_CACHE_TTL = 5 * 60 * 1000;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private async getCommissionTiers() {
    const now = Date.now();
    if (this.commissionCache && now - this.commissionCache.ts < this.COMMISSION_CACHE_TTL) {
      return this.commissionCache.data;
    }
    const data = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number }[]>`
      SELECT range_min, range_max, cleaner_share_no_tools
        FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
    `.catch(() => [] as any[]);
    this.commissionCache = { data, ts: now };
    return data;
  }

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

    // Compute & store cleaner_payout fire-and-forget (keep socket ACK fast)
    void (async () => {
      try {
        const ctx = await this.prisma.$queryRaw<{ base: number; travel: number; brings_tools: boolean | null; pricing_mode: string | null; hourly_share_pct: number | null; existing_payout: number | null }[]>`
          SELECT COALESCE(b.base_amount, b.total_amount) AS base,
                 COALESCE(b.travel_fee, 0) AS travel,
                 cp.brings_tools,
                 b.pricing_mode,
                 ht.cleaner_share_pct AS hourly_share_pct,
                 b.cleaner_payout AS existing_payout
            FROM bookings b
            LEFT JOIN cleaner_profiles cp ON cp.user_id = ${userId}::uuid
            LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
           WHERE b.id = ${body.bookingId}::uuid LIMIT 1
        `;
        // Jika cleaner_payout sudah ada (booking warranty redo), pakai nilai asli — jangan overwrite
        if (Number(ctx[0]?.existing_payout ?? 0) > 0) return;
        const base = Number(ctx[0]?.base ?? 0);
        const travel = Number(ctx[0]?.travel ?? 0);
        const bringsTools = !!ctx[0]?.brings_tools;
        const isHourly = ctx[0]?.pricing_mode === 'hourly';
        let sharePct: number;
        if (isHourly && ctx[0]?.hourly_share_pct != null) {
          sharePct = Number(ctx[0].hourly_share_pct);
        } else {
          const tiers = await this.prisma.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
            SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools
              FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
          `;
          const tier = tiers.find((t) => base >= Number(t.range_min ?? 0) && (t.range_max == null || base <= Number(t.range_max)));
          sharePct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
        }
        const payout = Math.round(base * sharePct / 100) + travel;
        if (payout > 0) {
          await this.prisma.$executeRaw`UPDATE bookings SET cleaner_payout = ${payout}::bigint WHERE id = ${body.bookingId}::uuid`;
        }
      } catch { /* non-fatal */ }
    })();

    return { ok: true };
  }

  getCleanerPoolSize(): number {
    return this.server?.sockets?.adapter?.rooms?.get(ROOM_AVAILABLE)?.size ?? 0;
  }

  emitJobTaken(bookingId: string, byUserId: string): void {
    this.server?.to(ROOM_AVAILABLE)?.emit('job-taken', { bookingId, by: byUserId });
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

    // Estimasi cleaner_payout dari cache — tidak perlu hit DB setiap broadcast
    if (!job.cleanerPayout || Number(job.cleanerPayout) <= 0) {
      const tiers = await this.getCommissionTiers();
      const total = Number(job.totalAmount ?? 0);
      const tier = tiers.find((t) => total >= Number(t.range_min ?? 0) && (t.range_max == null || total <= Number(t.range_max)));
      const pct = Number(tier?.cleaner_share_no_tools ?? 40);
      job.cleanerPayout = Math.round(total * pct / 100);
    }

    const { totalAmount: _hidden, ...jobForCleaner } = job;

    // ── 1. SOCKET: emit langsung, tidak tunggu apa-apa ──────────────────────
    this.server.to(ROOM_AVAILABLE).emit('incoming-job', jobForCleaner);
    const onlineCount = this.server.sockets.adapter.rooms.get(ROOM_AVAILABLE)?.size ?? 0;
    this.log.log(`broadcast incoming-job ${bookingId} -> socket=${onlineCount}`);

    // ── 2. FCM: fire-and-forget, tidak block socket ─────────────────────────
    void this.sendCleanerFcmBatch(bookingId, job).catch(() => {});
  }

  private async sendCleanerFcmBatch(
    bookingId: string,
    job: { addressLine: string; serviceName: string | null; cleanerPayout: number | null; totalAmount: number; pricingMode: string },
  ): Promise<void> {
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

    const eligible = cleaners.filter((cleaner) => {
      const areas = Array.isArray(cleaner.service_areas)
        ? cleaner.service_areas
            .filter((area): area is string => typeof area === 'string')
            .map((area) => area.trim().toLowerCase())
            .filter(Boolean)
        : [];
      if (areas.length === 0) return true;
      return areas.some((area) => normalizedAddress.includes(area));
    });

    if (eligible.length === 0) return;

    const payout = Number(job.cleanerPayout ?? 0);
    const displayName = job.pricingMode === 'hourly' ? 'Layanan Per Jam' : (job.serviceName ?? 'Layanan');
    const title = `Job baru: ${displayName}`;
    const body = `${payout > 0 ? `Pendapatan Rp ${payout.toLocaleString('id-ID')} · ` : ''}${job.addressLine.split(',').slice(0, 2).join(',')}`;

    await this.push.sendBatch(
      eligible.map((c) => ({
        userId: c.user_id,
        title,
        body,
        channel: 'incoming_job' as const,
        data: { type: 'incoming_job', bookingId },
        targetMode: 'freelancer' as const,
      })),
    );
    this.log.log(`FCM batch incoming-job ${bookingId} -> ${eligible.length} cleaners`);
  }
}
