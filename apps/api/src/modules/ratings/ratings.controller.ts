import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

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
  constructor(private readonly prisma: PrismaService, private readonly push: PushService) {}

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
    await this.prisma.$executeRaw`
      UPDATE wallet_ledger_entries
         SET status = 'CLEARED', cleared_at = NOW()
       WHERE reference_type = 'booking'
         AND reference_id = ${body.bookingId}::uuid
         AND status = 'PENDING'
         AND account_type = 'earnings'
    `;

    // Recompute cleaner_profiles aggregate (atomic)
    await this.prisma.$executeRaw`
      UPDATE cleaner_profiles cp
         SET rating_avg = (SELECT ROUND(AVG(rating)::numeric, 2) FROM ratings WHERE ratee_id = ${b.cleaner_id}::uuid),
             rating_count = (SELECT COUNT(*)::int FROM ratings WHERE ratee_id = ${b.cleaner_id}::uuid)
       WHERE cp.user_id = ${b.cleaner_id}::uuid
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

  // Get my own rating for a booking (customer side)
  @Get('booking/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async forBooking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, rating, review, tip_amount AS "tipAmount", created_at AS "createdAt"
        FROM ratings WHERE booking_id = ${id}::uuid AND rater_id = ${user.id}::uuid LIMIT 1
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
