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
             cp.rating_avg AS "ratingAvg", cp.rating_count AS "ratingCount",
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
        cp.kyc_status AS "kycStatus",
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
             COALESCE(
               NULLIF(BTRIM(r.rater_name_snapshot), ''),
               NULLIF(BTRIM(b.form_snapshot->>'customerName'), ''),
               NULLIF(BTRIM(cu.name), ''),
               NULLIF(BTRIM(u.name), ''),
               NULLIF(BTRIM(SPLIT_PART(COALESCE(u.email, ''), '@', 1)), ''),
               CASE
                 WHEN NULLIF(BTRIM(COALESCE(r.rater_phone_snapshot, b.form_snapshot->>'customerPhone', cu.phone, u.phone, '')), '') IS NOT NULL
                   THEN CONCAT('+', RIGHT(REGEXP_REPLACE(COALESCE(r.rater_phone_snapshot, b.form_snapshot->>'customerPhone', cu.phone, u.phone), '[^0-9]', '', 'g'), 6))
                 ELSE 'Pengguna'
               END
             ) AS "raterName"
        FROM ratings r
        LEFT JOIN bookings b ON b.id = r.booking_id
        LEFT JOIN users cu ON cu.id = b.customer_id
        LEFT JOIN users u ON u.id = r.rater_id
       WHERE r.ratee_id = ${id}::uuid
       ORDER BY r.created_at DESC LIMIT 20
    `;

    return {
      profile: rows[0],
      reviews,
    };
  }
}
