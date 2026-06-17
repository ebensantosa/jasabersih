import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { PrismaService } from '../../common/prisma.service';

@ApiTags('cleaner-public')
@Controller('cleaner/public')
export class CleanerPublicController {
  constructor(private readonly prisma: PrismaService) {}

  // Top cleaners — for home/explore featured section. Public, no auth.
  @Get('featured')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async featured() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT u.id, u.name, u.photo_url AS "photoUrl",
             cp.tier, cp.rating_avg AS "ratingAvg", cp.rating_count AS "ratingCount",
             cp.total_jobs_done AS "totalJobsDone", cp.brings_tools AS "bringsTools"
        FROM cleaner_profiles cp
        INNER JOIN users u ON u.id = cp.user_id
       WHERE cp.kyc_status = 'approved'
         AND (u.status = 'active' OR u.status IS NULL)
         AND cp.rating_count >= 3
       ORDER BY cp.rating_avg DESC NULLS LAST, cp.total_jobs_done DESC
       LIMIT 10
    `;
  }

  // Public: anyone can view cleaner profile (read-only).
  @Get(':id')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async profile(@Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        u.id, u.name, u.photo_url AS "photoUrl", u.created_at AS "joinedAt",
        cp.bio, cp.brings_tools AS "bringsTools",
        cp.service_areas AS "serviceAreas", cp.languages,
        cp.tier, cp.kyc_status AS "kycStatus",
        cp.rating_avg AS "ratingAvg", cp.rating_count AS "ratingCount",
        cp.acceptance_rate AS "acceptanceRate", cp.completion_rate AS "completionRate",
        cp.total_jobs_done AS "totalJobsDone"
      FROM users u
      INNER JOIN cleaner_profiles cp ON cp.user_id = u.id
      WHERE u.id = ${id}::uuid AND cp.kyc_status = 'approved'
      LIMIT 1
    `;
    if (rows.length === 0) throw new NotFoundException('Cleaner tidak ditemukan atau belum diverifikasi.');

    const reviews = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT r.rating, r.review, r.created_at AS "createdAt",
             u.name AS "raterName"
        FROM ratings r LEFT JOIN users u ON u.id = r.rater_id
       WHERE r.ratee_id = ${id}::uuid
       ORDER BY r.created_at DESC LIMIT 20
    `;

    return {
      profile: rows[0],
      reviews: reviews.map((review) => ({
        ...review,
        raterName: typeof review.raterName === 'string' ? maskName(review.raterName) : null,
      })),
    };
  }
}

function maskName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Pengguna';
  if (parts.length === 1) {
    const word = parts[0]!;
    return word.length <= 2 ? word : `${word[0]}${'*'.repeat(Math.max(1, word.length - 2))}${word.slice(-1)}`;
  }
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}
