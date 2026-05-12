import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const UpdateProfileSchema = z.object({
  bio: z.string().max(1000).optional(),
  // bringsTools INTENTIONALLY not allowed — admin-only via /admin/cleaners.
  // Self-toggle = fraud risk (cleaner claim bawa alat untuk komisi lebih tinggi
  // tanpa benar-benar bawa). Admin verifikasi peralatan dulu.
  serviceAreas: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  isAvailable: z.boolean().optional(),
});
type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

@ApiTags('cleaner-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cleaner/profile')
export class CleanerProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    // Auto-create profile row kalau belum ada
    await this.prisma.$executeRaw`
      INSERT INTO cleaner_profiles (user_id) VALUES (${user.id}::uuid)
      ON CONFLICT (user_id) DO NOTHING
    `;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT user_id AS "userId", bio, brings_tools AS "bringsTools",
             service_areas AS "serviceAreas", languages,
             is_available AS "isAvailable", kyc_status AS "kycStatus", tier,
             rating_avg AS "ratingAvg", rating_count AS "ratingCount",
             acceptance_rate AS "acceptanceRate", completion_rate AS "completionRate",
             total_jobs_done AS "totalJobsDone",
             approved_at AS "approvedAt", suspended_until AS "suspendedUntil"
        FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    return rows[0];
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileDto,
  ) {
    // Pastikan row ada
    await this.prisma.$executeRaw`
      INSERT INTO cleaner_profiles (user_id) VALUES (${user.id}::uuid)
      ON CONFLICT (user_id) DO NOTHING
    `;

    if (body.bio !== undefined) await this.prisma.$executeRaw`UPDATE cleaner_profiles SET bio = ${body.bio}, updated_at = NOW() WHERE user_id = ${user.id}::uuid`;
    if (body.serviceAreas !== undefined) await this.prisma.$executeRaw`UPDATE cleaner_profiles SET service_areas = ${JSON.stringify(body.serviceAreas)}::jsonb, updated_at = NOW() WHERE user_id = ${user.id}::uuid`;
    if (body.languages !== undefined) {
      // text[] requires array literal — use raw param
      await this.prisma.$executeRawUnsafe(`UPDATE cleaner_profiles SET languages = $1::text[], updated_at = NOW() WHERE user_id = $2::uuid`, body.languages, user.id);
    }
    if (body.isAvailable !== undefined) await this.prisma.$executeRaw`UPDATE cleaner_profiles SET is_available = ${body.isAvailable}, updated_at = NOW() WHERE user_id = ${user.id}::uuid`;

    return { ok: true };
  }
}
