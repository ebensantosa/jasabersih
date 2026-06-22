import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { AbuseLimitsService } from '../../common/abuse-limits.service';
import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PushService } from '../notifications/push.service';

const RateSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).optional(),
  tipAmount: z.number().int().nonnegative().default(0),
});
type RateDto = z.infer<typeof RateSchema>;

@ApiTags('ratings')
@Controller('ratings')
export class RatingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly abuse: AbuseLimitsService,
  ) {}

  // Submit rating untuk booking yang completed. Customer rates cleaner.
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RateSchema)) body: RateDto,
  ) {
    const rows = await this.prisma.$queryRaw<{ customer_id: string; cleaner_id: string | null; status: string }[]>`
      SELECT customer_id, cleaner_id, status FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new NotFoundException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id) throw new ForbiddenException('Hanya customer yang bisa rate.');
    if (b.status !== 'completed') throw new BadRequestException('Booking belum selesai.');
    if (!b.cleaner_id) throw new BadRequestException('Booking belum ada cleaner.');

    // Insert rating (UNIQUE booking_id → throws kalau sudah pernah rate)
    try {
      await this.prisma.$executeRaw`
        INSERT INTO ratings (booking_id, rater_id, ratee_id, rating, review, tip_amount)
        VALUES (${body.bookingId}::uuid, ${user.id}::uuid, ${b.cleaner_id}::uuid, ${body.rating}::int,
                ${body.review ?? null}, ${body.tipAmount}::bigint)
      `;
    } catch {
      throw new BadRequestException('Booking ini sudah pernah di-rate.');
    }

    // Customer submit rating = implicit "terima & konfirmasi" → release escrow.
    // Tidak peduli rating berapa — rating ≠ mekanisme tahan uang.
    // Customer yang gak puas wajib buka dispute (mekanisme proper, ada audit & resolution).
    // Ini mencegah abuse: customer kasih 1⭐ supaya cleaner gak dibayar tanpa alasan.
    // Idempotency guard: skip jika sudah ada ledger earnings CLEARED untuk booking ini.
    const alreadyReleased = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM wallet_ledger_entries
       WHERE reference_type = 'booking'
         AND reference_id = ${body.bookingId}::uuid
         AND account_type = 'earnings'
         AND status = 'CLEARED'
    `;
    if (Number(alreadyReleased[0]?.c ?? 0) === 0) {
      await this.prisma.$executeRaw`
        UPDATE wallet_ledger_entries
           SET status = 'CLEARED', cleared_at = NOW()
         WHERE reference_type = 'booking'
           AND reference_id = ${body.bookingId}::uuid
           AND status = 'PENDING'
           AND account_type = 'earnings'
      `;
    }

    // Incremental aggregate — O(1) bukan O(N).
    // new_avg = (old_avg * old_count + new_rating) / (old_count + 1)
    await this.prisma.$executeRaw`
      UPDATE cleaner_profiles
         SET rating_avg = ROUND(((COALESCE(rating_avg, 0) * COALESCE(rating_count, 0) + ${body.rating}::numeric) / (COALESCE(rating_count, 0) + 1))::numeric, 2),
             rating_count = COALESCE(rating_count, 0) + 1
       WHERE user_id = ${b.cleaner_id}::uuid
    `;

    // Tip → credit cleaner ledger if > 0
    if (body.tipAmount > 0) {
      await this.prisma.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
        VALUES (${b.cleaner_id}::uuid, 'earnings', ${body.tipAmount}::bigint, 'tip', ${body.bookingId}::uuid,
                'CLEARED', NOW(), 'Tip dari customer')
      `;
    }

    // Notify cleaner
    void this.push.send({
      userId: b.cleaner_id, channel: 'system',
      title: `Kamu dapat rating ${body.rating}⭐`,
      body: body.tipAmount > 0 ? `+ tip Rp ${body.tipAmount.toLocaleString('id-ID')}` : (body.review ?? 'Terima kasih sudah bekerja!'),
      data: { type: 'rating_received', bookingId: body.bookingId },
    }).catch(() => {});

    return { ok: true };
  }

  // PATCH /ratings/booking/:id — edit rating dalam window (default 24 jam).
  @Patch('booking/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Body() body: { rating?: number; review?: string },
  ) {
    const limits = await this.abuse.get();
    if (limits.ratingEditWindowHours <= 0) {
      throw new BadRequestException('Edit rating tidak diizinkan.');
    }
    if (body.rating != null && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) {
      throw new BadRequestException('Rating harus 1-5.');
    }
    if (body.review != null && body.review.length > 2000) {
      throw new BadRequestException('Review max 2000 karakter.');
    }
    const rows = await this.prisma.$queryRaw<{ id: string; ratee_id: string; created_at: Date }[]>`
      SELECT id, ratee_id, created_at FROM ratings
       WHERE booking_id = ${bookingId}::uuid AND rater_id = ${user.id}::uuid LIMIT 1
    `;
    const r = rows[0];
    if (!r) throw new NotFoundException('Rating tidak ditemukan.');
    const ageHours = (Date.now() - new Date(r.created_at).getTime()) / 3600_000;
    if (ageHours > limits.ratingEditWindowHours) {
      throw new BadRequestException(`Window edit ${limits.ratingEditWindowHours} jam sudah lewat.`);
    }
    await this.prisma.$executeRaw`
      UPDATE ratings SET
        rating = COALESCE(${body.rating ?? null}::int, rating),
        review = COALESCE(${body.review ?? null}::text, review)
      WHERE id = ${r.id}::uuid
    `;
    // Recompute aggregate — termasuk rating_count (dulu cuma avg, count jadi stale kalau di-edit)
    await this.prisma.$executeRaw`
      UPDATE cleaner_profiles cp
         SET rating_avg = (SELECT ROUND(AVG(rating)::numeric, 2) FROM ratings WHERE ratee_id = ${r.ratee_id}::uuid),
             rating_count = (SELECT COUNT(*)::int FROM ratings WHERE ratee_id = ${r.ratee_id}::uuid)
       WHERE cp.user_id = ${r.ratee_id}::uuid
    `;
    return { ok: true };
  }

  // Get my own rating for a booking (customer side)
  @Get('booking/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async forBooking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const bookings = await this.prisma.$queryRaw<{ customer_id: string; cleaner_id: string | null }[]>`
      SELECT customer_id, cleaner_id
        FROM bookings
       WHERE id = ${id}::uuid
       LIMIT 1
    `;
    const booking = bookings[0];
    if (!booking) throw new NotFoundException('Booking tidak ditemukan.');
    if (booking.customer_id !== user.id && booking.cleaner_id !== user.id) {
      throw new ForbiddenException('Kamu tidak punya akses ke rating booking ini.');
    }

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, rating, review, tip_amount AS "tipAmount", created_at AS "createdAt"
        FROM ratings
       WHERE booking_id = ${id}::uuid
       ORDER BY created_at DESC
       LIMIT 1
    `;
    return rows[0] ?? null;
  }

  // Public: list ratings received by a cleaner
  @Get('cleaner/:userId')
  async forCleaner(@Param('userId') userId: string) {
    const rows = await this.prisma.$queryRaw<{ id: string; rating: number; review: string | null; createdAt: Date; raterName: string | null }[]>`
      SELECT r.id, r.rating, r.review, r.created_at AS "createdAt",
             u.name AS "raterName"
        FROM ratings r
        LEFT JOIN users u ON u.id = r.rater_id
       WHERE r.ratee_id = ${userId}::uuid
       ORDER BY r.created_at DESC LIMIT 50
    `;
    // Sensor nama: "Ebentera Santosa" → "Ebentera S."
    return rows.map((r) => ({
      ...r,
      raterName: r.raterName ? maskName(r.raterName) : null,
    }));
  }
}

function maskName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.length <= 2 ? w : w[0]! + '*'.repeat(Math.max(1, w.length - 2)) + w.slice(-1);
  }
  // Keep first name, initial of last
  return `${parts[0]} ${parts[parts.length - 1]![0]!}.`;
}
