import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminJwtGuard, AdminRbacGuard, Roles } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-analytics')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  @Roles('super_admin', 'ops', 'finance', 'support', 'fraud_analyst')
  async overview() {
    // Run semua agg paralel
    const [
      todayStats, weekStats, monthStats,
      bookingByStatus, last7Days,
      userCounts, cleanerCounts,
      pendingActions, topCleaners,
      topServices, geoBreakdown,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ orders: number; gmv: number; revenue: number }[]>`
        SELECT
          COUNT(*)::int AS orders,
          COALESCE(SUM(total_amount), 0) AS gmv,
          COALESCE(SUM(platform_fee), 0) AS revenue
        FROM bookings WHERE created_at >= CURRENT_DATE
      `,
      this.prisma.$queryRaw<{ orders: number; gmv: number; revenue: number }[]>`
        SELECT
          COUNT(*)::int AS orders,
          COALESCE(SUM(total_amount), 0) AS gmv,
          COALESCE(SUM(platform_fee), 0) AS revenue
        FROM bookings WHERE created_at >= NOW() - INTERVAL '7 days'
      `,
      this.prisma.$queryRaw<{ orders: number; gmv: number; revenue: number }[]>`
        SELECT
          COUNT(*)::int AS orders,
          COALESCE(SUM(total_amount), 0) AS gmv,
          COALESCE(SUM(platform_fee), 0) AS revenue
        FROM bookings WHERE created_at >= NOW() - INTERVAL '30 days'
      `,
      this.prisma.$queryRaw<{ status: string; count: number }[]>`
        SELECT status, COUNT(*)::int AS count
          FROM bookings WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY status ORDER BY count DESC
      `,
      this.prisma.$queryRaw<{ day: Date; orders: number; gmv: number }[]>`
        SELECT
          DATE_TRUNC('day', created_at) AS day,
          COUNT(*)::int AS orders,
          COALESCE(SUM(total_amount), 0) AS gmv
        FROM bookings
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day ASC
      `,
      this.prisma.$queryRaw<{ total: number; active: number; suspended: number; banned: number; new_30d: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN status = 'active' OR status IS NULL THEN 1 ELSE 0 END)::int AS active,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END)::int AS suspended,
          SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END)::int AS banned,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END)::int AS new_30d
        FROM users WHERE is_customer = TRUE
      `,
      this.prisma.$queryRaw<{ total: number; approved: number; pending: number; under_review: number; rejected: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN cp.kyc_status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
          SUM(CASE WHEN cp.kyc_status = 'pending' THEN 1 ELSE 0 END)::int AS pending,
          SUM(CASE WHEN cp.kyc_status = 'under_review' THEN 1 ELSE 0 END)::int AS under_review,
          SUM(CASE WHEN cp.kyc_status = 'rejected' THEN 1 ELSE 0 END)::int AS rejected
        FROM users u INNER JOIN cleaner_profiles cp ON cp.user_id = u.id
        WHERE u.is_freelancer = TRUE
      `,
      this.prisma.$queryRaw<{ kyc_pending: number; withdrawal_pending: number; disputes_open: number; blocked_chat_24h: number; fraud_strikes_24h: number }[]>`
        SELECT
          (SELECT COUNT(*)::int FROM cleaner_profiles WHERE kyc_status IN ('pending', 'under_review')) AS kyc_pending,
          (SELECT COUNT(*)::int FROM withdrawals WHERE review_status = 'pending') AS withdrawal_pending,
          (SELECT COUNT(*)::int FROM disputes WHERE status IN ('open', 'in_progress', 'escalated')) AS disputes_open,
          (SELECT COUNT(*)::int FROM chat_messages WHERE status = 'blocked' AND created_at >= NOW() - INTERVAL '24 hours') AS blocked_chat_24h,
          (SELECT COUNT(*)::int FROM fraud_strikes WHERE created_at >= NOW() - INTERVAL '24 hours') AS fraud_strikes_24h
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT u.id, u.name, u.phone, cp.tier,
               cp.rating_avg AS "ratingAvg", cp.rating_count AS "ratingCount",
               cp.total_jobs_done AS "totalJobsDone"
          FROM cleaner_profiles cp
          INNER JOIN users u ON u.id = cp.user_id
         WHERE cp.kyc_status = 'approved'
         ORDER BY cp.rating_avg DESC NULLS LAST, cp.total_jobs_done DESC
         LIMIT 5
      `,
      this.prisma.$queryRaw<{ name: string; orders: number; gmv: number }[]>`
        SELECT s.name, COUNT(b.*)::int AS orders, COALESCE(SUM(b.total_amount), 0) AS gmv
          FROM bookings b INNER JOIN services s ON s.id = b.service_id
         WHERE b.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY s.name ORDER BY orders DESC LIMIT 8
      `,
      this.prisma.$queryRaw<{ city: string; orders: number; gmv: number }[]>`
        SELECT
          COALESCE(NULLIF(SPLIT_PART(b.address_line, ',', -2), ''), 'Unknown') AS city,
          COUNT(*)::int AS orders,
          COALESCE(SUM(b.total_amount), 0) AS gmv
        FROM bookings b
        WHERE b.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY city ORDER BY orders DESC LIMIT 6
      `,
    ]);

    // Funnel calculation (last 30 days)
    const totalOrders30d = bookingByStatus.reduce((s, x) => s + Number(x.count), 0);
    const completedCount = Number(bookingByStatus.find((x) => x.status === 'completed')?.count ?? 0);
    // Setelah migration 20260611100000 normalize → semua 'canceled'. Workaround dual-check dihapus.
    const cancelledCount = Number(bookingByStatus.find((x) => x.status === 'canceled')?.count ?? 0);

    return {
      today: todayStats[0] ?? { orders: 0, gmv: 0, revenue: 0 },
      week: weekStats[0] ?? { orders: 0, gmv: 0, revenue: 0 },
      month: monthStats[0] ?? { orders: 0, gmv: 0, revenue: 0 },
      bookingByStatus,
      last7Days,
      users: userCounts[0] ?? { total: 0, active: 0, suspended: 0, banned: 0, new_30d: 0 },
      cleaners: cleanerCounts[0] ?? { total: 0, approved: 0, pending: 0, under_review: 0, rejected: 0 },
      pending: pendingActions[0] ?? { kyc_pending: 0, withdrawal_pending: 0, disputes_open: 0, blocked_chat_24h: 0, fraud_strikes_24h: 0 },
      topCleaners,
      topServices,
      geoBreakdown,
      funnel30d: {
        totalOrders: totalOrders30d,
        completed: completedCount,
        cancelled: cancelledCount,
        completionRate: totalOrders30d > 0 ? Math.round((completedCount / totalOrders30d) * 100) : 0,
        cancelRate: totalOrders30d > 0 ? Math.round((cancelledCount / totalOrders30d) * 100) : 0,
      },
    };
  }
}
