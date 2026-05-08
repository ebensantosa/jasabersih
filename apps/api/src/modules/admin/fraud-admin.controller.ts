import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { FraudDetectionService } from './fraud-detection.service';

@ApiTags('admin-fraud')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/fraud')
export class AdminFraudController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly fraud: FraudDetectionService,
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
  // Manual override — biasanya cron auto run setiap jam (FraudDetectionService).
  @Post('run-detection')
  @Roles('super_admin', 'fraud_analyst')
  async runDetection(@CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const results = await this.fraud.runDetection();
    await this.audit.log({
      adminId: admin.id,
      action: 'fraud.run_detection_manual',
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
