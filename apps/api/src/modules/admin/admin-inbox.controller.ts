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
      chatUnread,
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
      this.prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM city_requests WHERE created_at > NOW() - INTERVAL '30 days' AND status != 'reviewed'`,
      // Chat yang menunggu balasan admin: HANYA booking manual (createdByAdmin)
      // atau booking dimana admin pernah ikut reply — dan pesan terakhir bukan dari admin.
      this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(DISTINCT b.id)::int AS c
          FROM bookings b
         WHERE (
           b.form_snapshot->>'createdByAdmin' = 'true'
           OR EXISTS (
             SELECT 1 FROM chat_messages cm2
             LEFT JOIN users u2 ON u2.id = cm2.sender_id
             WHERE cm2.booking_id = b.id AND u2.phone = '+62000000000001'
           )
         )
         AND EXISTS (SELECT 1 FROM chat_messages WHERE booking_id = b.id AND status = 'sent')
         AND (
           SELECT u3.phone FROM chat_messages cm3
           LEFT JOIN users u3 ON u3.id = cm3.sender_id
           WHERE cm3.booking_id = b.id AND cm3.status = 'sent'
           ORDER BY cm3.created_at DESC LIMIT 1
         ) <> '+62000000000001'
      `,
    ]);
    const counts = {
      kycPending: Number(kycPending[0]?.c ?? 0),
      disputesOpen: Number(disputesOpen[0]?.c ?? 0),
      withdrawalsPending: Number(withdrawalsPending[0]?.c ?? 0),
      bookingsNeedAssign: Number(bookingsNeedAssign[0]?.c ?? 0),
      fraudReports: Number(fraudReports[0]?.c ?? 0),
      cityRequests: Number(cityRequests[0]?.c ?? 0),
      chatUnread: Number(chatUnread[0]?.c ?? 0),
    };
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return { ...counts, total };
  }
}
