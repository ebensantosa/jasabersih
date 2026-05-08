import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminJwtGuard, AdminRbacGuard, Roles } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-referrals')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/referrals')
export class AdminReferralsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @Roles('super_admin', 'finance', 'ops')
  async stats() {
    const overall = await this.prisma.$queryRaw<{ total: number; pending: number; qualified: number; paid: number; total_paid: number }[]>`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::int AS pending,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END)::int AS qualified,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END)::int AS paid,
        COALESCE(SUM(CASE WHEN status IN ('qualified','paid') THEN bonus_amount ELSE 0 END), 0) AS total_paid
      FROM referrals
    `;
    const codeCount = await this.prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM referral_codes`;
    return {
      total: Number(overall[0]?.total ?? 0),
      pending: Number(overall[0]?.pending ?? 0),
      qualified: Number(overall[0]?.qualified ?? 0),
      paid: Number(overall[0]?.paid ?? 0),
      totalPaid: Number(overall[0]?.total_paid ?? 0),
      uniqueCodesGenerated: Number(codeCount[0]?.c ?? 0),
    };
  }

  // Per-referrer leaderboard — siapa paling banyak refer
  @Get('leaderboard')
  @Roles('super_admin', 'finance', 'ops')
  async leaderboard() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT rc.user_id AS "userId", rc.code,
             u.name AS "referrerName", u.phone AS "referrerPhone",
             rc.total_referrals AS "totalReferrals",
             rc.total_paid AS "totalPaid"
        FROM referral_codes rc
        LEFT JOIN users u ON u.id = rc.user_id
       ORDER BY rc.total_referrals DESC, rc.total_paid DESC
       LIMIT 100
    `;
  }

  // List semua referral row, dengan filter status
  @Get()
  @Roles('super_admin', 'finance', 'ops')
  async list(@Query('status') status?: 'pending' | 'qualified' | 'paid', @Query('q') q?: string) {
    const search = q?.trim() ? `%${q.trim()}%` : null;
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT r.id,
             r.referrer_id AS "referrerId",
             ru.name AS "referrerName", ru.phone AS "referrerPhone",
             rc.code AS "referrerCode",
             r.referred_id AS "referredId",
             u.name AS "referredName", u.phone AS "referredPhone",
             r.referrer_role AS "referrerRole",
             r.referred_role AS "referredRole",
             r.status, r.bonus_amount AS "bonusAmount",
             r.qualified_at AS "qualifiedAt", r.paid_at AS "paidAt",
             r.created_at AS "createdAt"
        FROM referrals r
        LEFT JOIN users ru ON ru.id = r.referrer_id
        LEFT JOIN users u ON u.id = r.referred_id
        LEFT JOIN referral_codes rc ON rc.user_id = r.referrer_id
       WHERE (${status ?? null}::text IS NULL OR r.status = ${status ?? null})
         AND (${search}::text IS NULL OR ru.name ILIKE ${search} OR ru.phone ILIKE ${search}
              OR u.name ILIKE ${search} OR u.phone ILIKE ${search} OR rc.code ILIKE ${search})
       ORDER BY r.created_at DESC LIMIT 200
    `;
  }
}
