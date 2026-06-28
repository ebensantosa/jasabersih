import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { AbuseLimitsService } from '../../common/abuse-limits.service';
import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { StorageService } from '../storage/storage.service';

const ALLOWED_TYPES = [
  // customer
  'quality', 'no_show', 'theft', 'payment', 'harassment', 'other',
  // cleaner
  'customer_absent', 'address_issue', 'access_denied', 'scope_mismatch', 'unsafe_items',
] as const;

const CreateDisputeSchema = z.object({
  bookingId: z.string().uuid(),
  type: z.enum(ALLOWED_TYPES),
  description: z.string().min(10).max(2000),
  evidenceKeys: z.array(z.string()).max(10).default([]), // R2 keys yg sudah di-upload via /upload-url
});
type CreateDisputeDto = z.infer<typeof CreateDisputeSchema>;

@ApiTags('disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly abuse: AbuseLimitsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT d.id, d.booking_id AS "bookingId", d.type, d.description,
             d.status, d.priority, d.resolution, d.payout_amount AS "payoutAmount",
             d.created_at AS "createdAt", d.resolved_at AS "resolvedAt"
        FROM disputes d WHERE d.raised_by = ${user.id}::uuid
        ORDER BY d.created_at DESC LIMIT 50
    `;
  }

  @Post('upload-url')
  async uploadUrl(@CurrentUser() user: AuthenticatedUser, @Body() body: { contentType: string }) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(body?.contentType)) throw new BadRequestException('contentType invalid.');
    return this.storage.createUploadUrl({
      bucket: 'private',
      keyPrefix: `disputes/${user.id}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateDisputeSchema)) body: CreateDisputeDto,
  ) {
    // Verify booking participant + status masih aktif
    const rows = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_id: string | null; status: string }[]>`
      SELECT customer_id, cleaner_id, status FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new NotFoundException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id && b.cleaner_id !== user.id) {
      throw new BadRequestException('Kamu bukan participant booking ini.');
    }
    const ALLOWED_STATUSES = ['matched', 'on_the_way', 'in_progress', 'completed'];
    if (!ALLOWED_STATUSES.includes(b.status)) {
      throw new BadRequestException('Dispute hanya bisa diajukan saat booking masih aktif atau baru selesai.');
    }
    // Completed bookings: only within 24h
    if (b.status === 'completed') {
      const completedAt = await this.prisma.$queryRaw<{ completed_at: Date | null }[]>`
        SELECT completed_at FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
      `;
      const ts = completedAt[0]?.completed_at;
      if (!ts || Date.now() - new Date(ts).getTime() > 24 * 3600_000) {
        throw new BadRequestException('Batas waktu laporan sudah lewat (24 jam setelah selesai).');
      }
    }

    // Subject = the OTHER party
    const subjectUserId = b.customer_id === user.id ? b.cleaner_id : b.customer_id;

    // Anti-abuse: max dispute open dari customer ini ke cleaner yang sama.
    const limits = await this.abuse.get();
    if (limits.maxOpenDisputesSameCleaner > 0 && subjectUserId) {
      const cnt = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM disputes
         WHERE raised_by = ${user.id}::uuid
           AND subject_user_id = ${subjectUserId}::uuid
           AND status IN ('open', 'in_progress', 'escalated')
      `;
      if (Number(cnt[0]?.c ?? 0) >= limits.maxOpenDisputesSameCleaner) {
        throw new BadRequestException('Kamu sudah punya dispute open dengan cleaner ini. Tunggu admin review dulu.');
      }
    }

    const evidence = body.evidenceKeys.map((key) => ({ key, type: 'image' as const, addedBy: user.id, addedAt: new Date().toISOString() }));

    // SLA 24 jam
    const slaDueAt = new Date(Date.now() + 24 * 3600_000).toISOString();

    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO disputes (booking_id, raised_by, subject_user_id, type, description, evidence, status, priority, sla_due_at)
      VALUES (
        ${body.bookingId}::uuid, ${user.id}::uuid,
        ${subjectUserId}::uuid, ${body.type}, ${body.description},
        ${JSON.stringify(evidence)}::jsonb, 'open', 'normal',
        ${slaDueAt}::timestamptz
      ) RETURNING id
    `;
    return { id: inserted[0]?.id, status: 'open' };
  }
}
