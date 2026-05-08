import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-fraud')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/fraud')
export class AdminFraudController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  // Combined view: fraud_strikes + risk metrics per user.
  @Get('signals')
  @Roles('super_admin', 'fraud_analyst', 'ops')
  async signals(@Query('limit') limit?: string) {
    const lim = Math.min(Number(limit ?? 100), 500);
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT f.id, f.user_id AS "userId", f.strike_type AS "strikeType",
             f.reference_id AS "referenceId", f.details, f.created_at AS "createdAt",
             u.name AS "userName", u.phone AS "userPhone", u.status AS "userStatus",
             (SELECT COUNT(*) FROM fraud_strikes WHERE user_id = u.id)::int AS "totalStrikes"
        FROM fraud_strikes f
        LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC
       LIMIT ${lim}::int
    `;
  }

  // Manually flag a user — used when admin spots fraud not caught by auto-rules
  @Post('flag')
  @Roles('super_admin', 'fraud_analyst', 'ops')
  async flag(
    @Body() body: { userId: string; strikeType: string; details?: Record<string, unknown> },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.userId || !body?.strikeType) throw new BadRequestException('userId & strikeType wajib.');
    await this.prisma.$executeRaw`
      INSERT INTO fraud_strikes (user_id, strike_type, details)
      VALUES (${body.userId}::uuid, ${body.strikeType}, ${JSON.stringify({ ...body.details, manualFlagBy: admin.id })}::jsonb)
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'fraud.manual_flag',
      resourceType: 'user',
      resourceId: body.userId,
      changes: { strikeType: body.strikeType, details: body.details ?? null },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // Run auto-detection rules NOW. Returns count of new strikes added.
  // Rules implemented (basic, expandable):
  //   1. Cancel rate cleaner > 30% in last 30 days
  //   2. Refund rate customer > 25% in last 30 days
  //   3. Multiple users sharing same device_fingerprint
  //   4. Chat messages containing phone/WA/transfer keywords (off-platform leak)
  @Post('run-detection')
  @Roles('super_admin', 'fraud_analyst')
  async runDetection(@CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const results = {
      highCancelRateCleaners: 0,
      highRefundRateCustomers: 0,
      sharedDevices: 0,
      offPlatformChats: 0,
    };

    // 1. Cleaner cancel rate > 30% (last 30d, min 5 jobs)
    const r1 = await this.prisma.$executeRaw`
      WITH stats AS (
        SELECT cleaner_id,
               COUNT(*)::int AS total,
               SUM(CASE WHEN status = 'cancelled' AND cancellation_reason NOT IN ('admin_ban', 'customer_cancel') THEN 1 ELSE 0 END)::int AS cancelled
          FROM bookings
         WHERE cleaner_id IS NOT NULL
           AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY cleaner_id
        HAVING COUNT(*) >= 5
      )
      INSERT INTO fraud_strikes (user_id, strike_type, details)
      SELECT cleaner_id,
             'high_cancel_rate',
             jsonb_build_object('total', total, 'cancelled', cancelled, 'rate', ROUND(cancelled::numeric / total * 100, 1))
        FROM stats
       WHERE cancelled::numeric / total > 0.30
         AND NOT EXISTS (
           SELECT 1 FROM fraud_strikes fs
            WHERE fs.user_id = stats.cleaner_id
              AND fs.strike_type = 'high_cancel_rate'
              AND fs.created_at > NOW() - INTERVAL '7 days'
         )
    `;
    results.highCancelRateCleaners = Number(r1);

    // 2. Customer refund rate > 25% (last 30d, min 4 orders)
    const r2 = await this.prisma.$executeRaw`
      WITH stats AS (
        SELECT customer_id,
               COUNT(*)::int AS total,
               SUM(CASE WHEN id IN (SELECT booking_id FROM disputes WHERE payout_amount IS NOT NULL AND payout_amount > 0) THEN 1 ELSE 0 END)::int AS refunded
          FROM bookings
         WHERE created_at > NOW() - INTERVAL '30 days'
         GROUP BY customer_id
        HAVING COUNT(*) >= 4
      )
      INSERT INTO fraud_strikes (user_id, strike_type, details)
      SELECT customer_id,
             'high_refund_rate',
             jsonb_build_object('total', total, 'refunded', refunded, 'rate', ROUND(refunded::numeric / total * 100, 1))
        FROM stats
       WHERE refunded::numeric / total > 0.25
         AND NOT EXISTS (
           SELECT 1 FROM fraud_strikes fs
            WHERE fs.user_id = stats.customer_id
              AND fs.strike_type = 'high_refund_rate'
              AND fs.created_at > NOW() - INTERVAL '7 days'
         )
    `;
    results.highRefundRateCustomers = Number(r2);

    // 3. Shared device fingerprint — > 1 user_id on same fingerprint
    const r3 = await this.prisma.$executeRaw`
      WITH shared AS (
        SELECT device_fingerprint, ARRAY_AGG(DISTINCT user_id) AS user_ids
          FROM user_devices
         WHERE device_fingerprint IS NOT NULL
         GROUP BY device_fingerprint
        HAVING COUNT(DISTINCT user_id) > 1
      )
      INSERT INTO fraud_strikes (user_id, strike_type, details)
      SELECT UNNEST(user_ids),
             'shared_device',
             jsonb_build_object('fingerprint', device_fingerprint, 'shared_with_count', array_length(user_ids, 1))
        FROM shared
       WHERE NOT EXISTS (
         SELECT 1 FROM fraud_strikes fs
          WHERE fs.user_id = ANY(shared.user_ids)
            AND fs.strike_type = 'shared_device'
            AND fs.details->>'fingerprint' = shared.device_fingerprint
       )
    `;
    results.sharedDevices = Number(r3);

    // 4. Chat messages containing off-platform keywords
    const r4 = await this.prisma.$executeRaw`
      INSERT INTO fraud_strikes (user_id, strike_type, reference_id, details)
      SELECT cm.sender_id,
             'off_platform_chat',
             cm.id,
             jsonb_build_object('booking_id', cm.booking_id, 'snippet', LEFT(cm.content, 100))
        FROM chat_messages cm
       WHERE cm.created_at > NOW() - INTERVAL '7 days'
         AND cm.sender_id IS NOT NULL
         AND cm.content IS NOT NULL
         AND (
           cm.content ~* '(0[2-9][0-9]{8,11})'
           OR cm.content ~* '\\b(wa|whatsapp|wa\\.me|chat\\s+wa)\\b'
           OR cm.content ~* '\\b(transfer|tf|bca|mandiri|bri|bni)\\b'
           OR cm.content ~* '\\b(cash|tunai\\s+aja|off\\s*app|luar\\s+app)\\b'
         )
         AND NOT EXISTS (
           SELECT 1 FROM fraud_strikes fs
            WHERE fs.reference_id = cm.id AND fs.strike_type = 'off_platform_chat'
         )
    `;
    results.offPlatformChats = Number(r4);

    await this.audit.log({
      adminId: admin.id,
      action: 'fraud.run_detection',
      resourceType: 'system',
      changes: results,
      ipAddress: req.ip ?? null,
    });

    return { ok: true, results };
  }

  @Post('strikes/:id/dismiss')
  @Roles('super_admin', 'fraud_analyst')
  async dismiss(@Param('id') id: string, @Body() body: { reason: string }, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    if (!body?.reason) throw new BadRequestException('Alasan wajib.');
    await this.prisma.$executeRaw`DELETE FROM fraud_strikes WHERE id = ${id}::uuid`;
    await this.audit.log({
      adminId: admin.id,
      action: 'fraud.dismiss_strike',
      resourceType: 'fraud_strike',
      resourceId: id,
      changes: { reason: body.reason },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }
}
