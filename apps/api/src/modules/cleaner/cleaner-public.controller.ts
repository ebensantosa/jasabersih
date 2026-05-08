import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';

@ApiTags('cleaner-public')
@Controller('cleaner/public')
export class CleanerPublicController {
  constructor(private readonly prisma: PrismaService) {}

  // Public: anyone can view cleaner profile (read-only).
  @Get(':id')
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
       WHERE r.ratee_id = ${id}::uuid AND r.review IS NOT NULL
       ORDER BY r.created_at DESC LIMIT 20
    `;

    return { profile: rows[0], reviews };
  }
}
