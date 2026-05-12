import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PushService } from '../notifications/push.service';

@ApiTags('fraud-reports')
@Controller()
export class FraudReportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly push: PushService,
  ) {}

  // ============ CUSTOMER (mobile) ============
  @Post('reports/fraud')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { bookingId: string; category: string; description?: string; evidenceUrls?: string[] },
  ) {
    if (!body?.bookingId) throw new BadRequestException('bookingId wajib');
    const allowed = ['ask_phone', 'ask_payment_outside', 'inappropriate', 'other'];
    if (!allowed.includes(body.category)) throw new BadRequestException('Kategori tidak valid');

    // Find booking + verify reporter is the customer
    const rows = await this.prisma.$queryRaw<{ customer_id: string; cleaner_id: string | null }[]>`
      SELECT customer_id, cleaner_id FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new BadRequestException('Booking tidak ditemukan');
    if (b.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu');

    try {
      await this.prisma.$executeRaw`
        INSERT INTO fraud_reports (booking_id, reporter_id, reported_id, category, description, evidence_urls)
        VALUES (${body.bookingId}::uuid, ${user.id}::uuid, ${b.cleaner_id}::uuid,
                ${body.category}, ${body.description ?? null}, ${JSON.stringify(body.evidenceUrls ?? [])}::jsonb)
      `;
    } catch (e: any) {
      if (String(e?.message ?? '').includes('duplicate')) {
        throw new BadRequestException('Kamu sudah pernah lapor untuk pesanan ini');
      }
      throw e;
    }
    return { ok: true };
  }

  // ============ ADMIN ============
  @Get('admin/fraud-reports')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRbacGuard)
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async list(@Query('status') status?: string) {
    return this.prisma.$queryRaw`
      SELECT fr.id, fr.booking_id AS "bookingId", fr.category, fr.description,
             fr.evidence_urls AS "evidenceUrls", fr.status,
             fr.reward_voucher_code AS "rewardVoucherCode",
             fr.admin_notes AS "adminNotes", fr.created_at AS "createdAt",
             fr.reviewed_at AS "reviewedAt",
             reporter.name AS "reporterName", reporter.phone AS "reporterPhone",
             reported.name AS "reportedName", reported.phone AS "reportedPhone"
        FROM fraud_reports fr
        LEFT JOIN users reporter ON reporter.id = fr.reporter_id
        LEFT JOIN users reported ON reported.id = fr.reported_id
       WHERE (${status ?? null}::text IS NULL OR fr.status = ${status ?? null})
       ORDER BY fr.created_at DESC LIMIT 200
    `;
  }

  @Post('admin/fraud-reports/:id/review')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRbacGuard)
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async review(
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; adminNotes?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!['approved', 'rejected'].includes(body?.decision)) throw new BadRequestException('decision wajib');

    const rows = await this.prisma.$queryRaw<{ id: string; reporter_id: string; reported_id: string | null; status: string }[]>`
      SELECT id, reporter_id, reported_id, status FROM fraud_reports WHERE id = ${id}::uuid LIMIT 1
    `;
    const r = rows[0];
    if (!r) throw new BadRequestException('Report tidak ditemukan');
    if (r.status !== 'pending') throw new BadRequestException(`Report sudah ${r.status}`);

    let voucherCode: string | null = null;
    if (body.decision === 'approved') {
      // Read reward amount from app_config
      const cfg = await this.prisma.$queryRaw<{ value: any }[]>`
        SELECT value FROM app_config WHERE key = 'fraud.report_reward_amount' LIMIT 1
      `;
      const amount = Number(cfg[0]?.value ?? 50000);

      voucherCode = `FRAUDRWD-${Date.now().toString(36).toUpperCase()}`;
      await this.prisma.$executeRaw`
        INSERT INTO vouchers (code, type, value, min_order_amount, valid_from, valid_until,
                              total_quota, per_user_limit, targeting, is_stackable, is_active)
        VALUES (${voucherCode}, 'fixed', ${amount}::bigint, 0,
                NOW(), NOW() + INTERVAL '90 days', 1, 1,
                ${JSON.stringify({ userIds: [r.reporter_id] })}::jsonb, FALSE, TRUE)
      `;

      // Push notif customer with voucher code
      void this.push.send({
        userId: r.reporter_id, channel: 'reward',
        title: `Voucher Rp ${amount.toLocaleString('id-ID')} untukmu! 🎉`,
        body: `Terima kasih sudah lapor. Pakai kode ${voucherCode} di order berikutnya.`,
        data: { type: 'fraud_report_approved', voucherCode },
      }).catch(() => {});

      // Strike the reported cleaner
      if (r.reported_id) {
        await this.prisma.$executeRaw`
          INSERT INTO user_strikes (user_id, type, severity, reason, issued_by)
          VALUES (${r.reported_id}::uuid, 'fraud_off_platform', 'high',
                  'Report fraud di-approve admin', ${admin.id}::uuid)
          ON CONFLICT DO NOTHING
        `.catch(() => {/* table optional */});
      }
    }

    await this.prisma.$executeRaw`
      UPDATE fraud_reports
         SET status = ${body.decision},
             admin_notes = ${body.adminNotes ?? null},
             reward_voucher_code = ${voucherCode},
             reviewed_by = ${admin.id}::uuid,
             reviewed_at = NOW()
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id, action: 'fraud_report.review', resourceType: 'fraud_report', resourceId: id,
      changes: { decision: body.decision, voucherCode, adminNotes: body.adminNotes },
      ipAddress: req.ip ?? null,
    });
    return { ok: true, voucherCode };
  }
}
