import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminJwtGuard, AdminRbacGuard, Roles } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-inbox')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/inbox')
export class AdminInboxController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /v1/admin/inbox/counts — total pending items yang butuh perhatian admin
  @Get('counts')
  @Roles('super_admin', 'ops', 'support', 'fraud_analyst', 'finance')
  async counts() {
    const [
      kycPending,
      disputesOpen,
      withdrawalsPending,
      bookingsNeedAssign,
      fraudReports,
      cityRequests,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM cleaner_profiles WHERE kyc_status = 'under_review'`,
      this.prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM disputes WHERE status IN ('open', 'in_progress', 'escalated')`,
      this.prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM withdrawals WHERE review_status = 'pending'`,
      this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM bookings
         WHERE status = 'searching' AND cleaner_id IS NULL
           AND COALESCE(paid_at, created_at) < NOW() - INTERVAL '5 minutes'
      `,
      this.prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM fraud_reports WHERE status = 'open'`,
      this.prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM city_requests WHERE created_at > NOW() - INTERVAL '30 days'`,
    ]);
    const counts = {
      kycPending: Number(kycPending[0]?.c ?? 0),
      disputesOpen: Number(disputesOpen[0]?.c ?? 0),
      withdrawalsPending: Number(withdrawalsPending[0]?.c ?? 0),
      bookingsNeedAssign: Number(bookingsNeedAssign[0]?.c ?? 0),
      fraudReports: Number(fraudReports[0]?.c ?? 0),
      cityRequests: Number(cityRequests[0]?.c ?? 0),
    };
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return { ...counts, total };
  }
}
