import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { JobsGateway } from '../jobs/jobs.gateway';

const CreateBookingSchema = z.object({
  pricingMode: z.enum(['package', 'hourly', 'wa_survey']),
  serviceId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  hourlyTierId: z.string().uuid().optional(),
  hoursBooked: z.number().min(1).max(12).optional(),
  scheduledAt: z.string(), // ISO datetime
  addressLine: z.string().min(5),
  lat: z.number().optional(),
  lng: z.number().optional(),
  customerNotes: z.string().max(500).optional(),
  baseAmount: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
  formSnapshot: z.record(z.unknown()).default({}),
});
type CreateBookingDto = z.infer<typeof CreateBookingSchema>;

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly prisma: PrismaService, private readonly jobs: JobsGateway) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRawUnsafe(
      `SELECT b.id, b.status, b.pricing_mode AS "pricingMode", b.total_amount AS total,
              b.scheduled_at AS "scheduledAt", b.address_line AS address, b.created_at AS "createdAt",
              s.name AS "serviceName", s.icon_url AS "serviceIcon",
              pp.name AS "packageName", cl.name AS "cleanerName", cl.id AS "cleanerId"
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN pricing_packages pp ON pp.id = b.package_id
       LEFT JOIN users cl ON cl.id = b.cleaner_id
       WHERE b.customer_id = $1::uuid
       ORDER BY b.created_at DESC LIMIT 50`,
      user.id,
    );
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // Explicit columns — exclude `location` (PostGIS GEOGRAPHY tidak bisa
    // di-JSON-serialize → response 500). Pakai ST_X/ST_Y kalau perlu lat/lng.
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT b.id, b.status, b.pricing_mode, b.total_amount, b.base_amount,
              b.scheduled_at, b.address_line, b.customer_notes, b.form_snapshot,
              b.customer_id, b.cleaner_id, b.service_id, b.package_id,
              b.cleaner_payout, b.matched_at, b.paid_at, b.canceled_at,
              b.completed_at, b.created_at,
              ST_X(b.location::geometry) AS lng, ST_Y(b.location::geometry) AS lat,
              s.name AS service_name, s.icon_url AS service_icon,
              cu.name AS customer_name, cu.phone AS customer_phone,
              cl.name AS cleaner_name, cl.phone AS cleaner_phone
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN users cu ON cu.id = b.customer_id
         LEFT JOIN users cl ON cl.id = b.cleaner_id
        WHERE b.id = $1::uuid AND (b.customer_id = $2::uuid OR b.cleaner_id = $2::uuid)
        LIMIT 1`,
      id,
      user.id,
    );
    if (!rows[0]) throw new BadRequestException('Booking tidak ditemukan');
    return rows[0];
  }

  // Live searching stats — dipakai customer screen untuk render Gojek-style UI
  @Get(':id/search-status')
  async searchStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<{ status: string; created_at: Date; customer_id: string }[]>`
      SELECT status, created_at, customer_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new BadRequestException('Booking tidak ditemukan');
    if (b.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu');
    const elapsedSec = Math.floor((Date.now() - new Date(b.created_at).getTime()) / 1000);
    const TIMEOUT_SEC = 15 * 60;
    return {
      status: b.status,
      elapsedSec,
      timeoutSec: TIMEOUT_SEC,
      remainingSec: Math.max(0, TIMEOUT_SEC - elapsedSec),
      broadcastedTo: b.status === 'searching' ? this.jobs.getCleanerPoolSize() : 0,
      timedOut: b.status === 'searching' && elapsedSec >= TIMEOUT_SEC,
    };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateBookingSchema)) body: CreateBookingDto,
  ) {
    const row = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO bookings (
        customer_id, service_id, pricing_mode, package_id, hourly_tier_id, hours_booked,
        status, form_snapshot, scheduled_at, address_line, location, customer_notes,
        base_amount, total_amount
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6,
        'pending_payment', $7::jsonb, $8::timestamptz, $9,
        ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
        $12, $13, $14
      )
      RETURNING id`,
      user.id,
      body.serviceId ?? null,
      body.pricingMode,
      body.packageId ?? null,
      body.hourlyTierId ?? null,
      body.hoursBooked ?? null,
      JSON.stringify(body.formSnapshot),
      body.scheduledAt,
      body.addressLine,
      body.lng ?? 110.3695,
      body.lat ?? -7.7956,
      body.customerNotes ?? null,
      body.baseAmount,
      body.totalAmount,
    );
    return { id: row[0]?.id };
  }

  @Post(':id/pay')
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body?: { useCredit?: boolean },
  ) {
    const bk = await this.prisma.$queryRawUnsafe<{ total_amount: number; status: string }[]>(
      `SELECT total_amount, status FROM bookings WHERE id = $1::uuid AND customer_id = $2::uuid LIMIT 1`,
      id, user.id,
    );
    if (!bk[0]) throw new BadRequestException('Booking tidak ditemukan');
    if (bk[0].status !== 'pending_payment') throw new BadRequestException('Booking tidak dalam status pending_payment');

    if (body?.useCredit) {
      const bal = await this.prisma.$queryRawUnsafe<{ b: number }[]>(
        `SELECT COALESCE(SUM(CASE WHEN account_type IN ('refund_credit','topup') AND status='CLEARED' THEN amount ELSE 0 END),0)
              - COALESCE(SUM(CASE WHEN account_type IN ('credit_use','withdrawal') AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END),0) AS b
           FROM wallet_ledger_entries WHERE user_id = $1::uuid`,
        user.id,
      );
      const balance = Number(bal[0]?.b ?? 0);
      const use = Math.min(balance, Number(bk[0].total_amount));
      if (use > 0) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
           VALUES ($1::uuid, 'credit_use', $2, 'booking', $3::uuid, 'CLEARED', NOW(), $4)`,
          user.id, use, id, `Pakai saldo untuk booking ${id.slice(0, 8)}`,
        );
      }
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE bookings SET status = 'searching', paid_at = NOW()
       WHERE id = $1::uuid AND customer_id = $2::uuid AND status = 'pending_payment'`,
      id, user.id,
    );
    void this.jobs.broadcastIncomingJob(id).catch(() => {});
    return { ok: true };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ status: string; paid_at: Date | null }[]>(
      `SELECT status, paid_at FROM bookings WHERE id = $1::uuid AND customer_id = $2::uuid LIMIT 1`,
      id,
      user.id,
    );
    if (rows.length === 0) throw new BadRequestException('Pesanan tidak ditemukan');
    const { status, paid_at } = rows[0]!;
    if (status === 'canceled') throw new BadRequestException('Pesanan sudah dibatalkan');
    if (status === 'completed') throw new BadRequestException('Pesanan sudah selesai, tidak bisa dibatalkan');
    if (paid_at || status !== 'pending_payment') {
      throw new BadRequestException('Pesanan yang sudah dibayar tidak bisa dibatalkan. Hubungi customer service jika ada masalah.');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE bookings SET status = 'canceled', canceled_at = NOW()
       WHERE id = $1::uuid AND customer_id = $2::uuid`,
      id,
      user.id,
    );
    return { ok: true };
  }
}
