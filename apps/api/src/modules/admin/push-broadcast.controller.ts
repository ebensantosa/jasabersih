import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

type Audience = 'all' | 'customer' | 'cleaner' | 'kyc_approved' | 'new_customer_7d' | 'inactive_30d';

@ApiTags('admin-broadcast')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/broadcast')
export class AdminBroadcastController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly audit: AdminAuditService,
  ) {}

  // Preview: count how many users match the audience
  @Get('estimate')
  @Roles('super_admin', 'ops')
  async estimate(@Query('audience') audience: Audience = 'all') {
    const where = this.audienceWhere(audience);
    const rows = await this.prisma.$queryRawUnsafe<{ c: number }[]>(`
      SELECT COUNT(*)::int AS c FROM users u WHERE 1=1 ${where}
    `);
    const totalUsers = Number(rows[0]?.c ?? 0);
    // Estimate reachable (have FCM token)
    const reachableRows = await this.prisma.$queryRawUnsafe<{ c: number }[]>(`
      SELECT COUNT(DISTINCT ud.user_id)::int AS c
        FROM users u
        INNER JOIN user_devices ud ON ud.user_id = u.id
       WHERE ud.fcm_token IS NOT NULL AND ud.fcm_token <> ''
       ${where}
    `);
    return { totalUsers, reachable: Number(reachableRows[0]?.c ?? 0) };
  }

  // Send broadcast NOW (sync — for small audience). For large, would queue (TODO).
  @Post('send')
  @Roles('super_admin', 'ops')
  async send(
    @Body() body: { title: string; body: string; audience: Audience; ctaLink?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.title || !body?.body) throw new BadRequestException('title & body wajib.');
    if (!['all', 'customer', 'cleaner', 'kyc_approved', 'new_customer_7d', 'inactive_30d'].includes(body.audience)) {
      throw new BadRequestException('audience invalid.');
    }
    const where = this.audienceWhere(body.audience);

    // Get user ids (cap 5000 untuk safety)
    const users = await this.prisma.$queryRawUnsafe<{ id: string }[]>(`
      SELECT u.id FROM users u WHERE 1=1 ${where} LIMIT 5000
    `);
    let sent = 0, failed = 0;
    // Send sequentially with small batching (Expo accepts up to 100 per request — PushService handles per user)
    for (const u of users) {
      try {
        const r = await this.push.send({
          userId: u.id,
          title: body.title,
          body: body.body,
          channel: 'system',
          data: { type: 'broadcast', ctaLink: body.ctaLink ?? null },
        });
        sent += r.sent; failed += r.failed;
      } catch { failed++; }
    }

    await this.audit.log({
      adminId: admin.id, action: 'broadcast.send', resourceType: 'push_campaign',
      changes: { audience: body.audience, title: body.title, audienceSize: users.length, sent, failed },
      ipAddress: req.ip ?? null,
    });
    return { audienceSize: users.length, sent, failed };
  }

  // History (from notification_logs aggregated by audit_log entries)
  // ===== SCHEDULED BROADCAST =====
  // POST /admin/broadcast/schedule — jadwalin push delivery di waktu future.
  // Cron @ScheduledBroadcastService akan kirim saat scheduled_at <= NOW().
  @Post('schedule')
  @Roles('super_admin', 'ops')
  async schedule(
    @Body() body: { title: string; body: string; audience: Audience; ctaLink?: string; scheduledAt: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const title = (body.title ?? '').trim();
    const msgBody = (body.body ?? '').trim();
    if (title.length < 3 || title.length > 100) throw new BadRequestException('Title 3-100 char');
    if (msgBody.length < 10 || msgBody.length > 500) throw new BadRequestException('Body 10-500 char');
    const scheduled = new Date(body.scheduledAt);
    if (isNaN(scheduled.getTime())) throw new BadRequestException('scheduledAt tidak valid');
    if (scheduled.getTime() < Date.now() + 60_000) {
      throw new BadRequestException('Minimal 1 menit dari sekarang. Gunakan POST /send untuk kirim langsung.');
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO scheduled_broadcasts (title, body, audience, cta_link, scheduled_at, created_by)
      VALUES (${title}, ${msgBody}, ${body.audience}, ${body.ctaLink ?? null}, ${scheduled.toISOString()}::timestamptz, ${admin.id}::uuid)
      RETURNING id
    `;
    await this.audit.log({
      adminId: admin.id, action: 'broadcast.schedule', resourceType: 'scheduled_broadcast',
      resourceId: rows[0]!.id, changes: { title, audience: body.audience, scheduledAt: body.scheduledAt },
      ipAddress: req.ip ?? null,
    });
    return { id: rows[0]!.id, ok: true };
  }

  @Get('scheduled')
  @Roles('super_admin', 'ops', 'support')
  async listScheduled() {
    return this.prisma.$queryRaw`
      SELECT id, title, body, audience, cta_link AS "ctaLink",
             scheduled_at AS "scheduledAt", status, sent_at AS "sentAt",
             sent_count AS "sentCount", failed_count AS "failedCount", error_msg AS "errorMsg",
             created_at AS "createdAt"
        FROM scheduled_broadcasts
       ORDER BY scheduled_at DESC LIMIT 50
    `;
  }

  @Post('scheduled/:id/cancel')
  @Roles('super_admin', 'ops')
  async cancelScheduled(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const r = await this.prisma.$executeRaw`
      UPDATE scheduled_broadcasts SET status = 'cancelled' WHERE id = ${id}::uuid AND status = 'pending'
    `;
    if (Number(r) === 0) throw new BadRequestException('Tidak bisa cancel (sudah terkirim atau gak ditemukan)');
    await this.audit.log({
      adminId: admin.id, action: 'broadcast.cancel_schedule', resourceType: 'scheduled_broadcast',
      resourceId: id, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // ===== TEMPLATES =====
  @Get('templates')
  @Roles('super_admin', 'ops', 'support')
  async listTemplates() {
    return this.prisma.$queryRaw`
      SELECT id, name, title, body, audience, cta_link AS "ctaLink", category,
             used_count AS "usedCount", last_used_at AS "lastUsedAt", created_at AS "createdAt"
        FROM broadcast_templates
       ORDER BY used_count DESC, created_at DESC
       LIMIT 100
    `;
  }

  @Post('templates')
  @Roles('super_admin', 'ops')
  async createTemplate(
    @Body() body: { name: string; title: string; body: string; audience: Audience; ctaLink?: string; category?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const name = (body.name ?? '').trim();
    const title = (body.title ?? '').trim();
    const msgBody = (body.body ?? '').trim();
    if (name.length < 3 || name.length > 100) throw new BadRequestException('Name 3-100 char');
    if (title.length < 3 || title.length > 100) throw new BadRequestException('Title 3-100 char');
    if (msgBody.length < 10 || msgBody.length > 500) throw new BadRequestException('Body 10-500 char');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO broadcast_templates (name, title, body, audience, cta_link, category, created_by)
      VALUES (${name}, ${title}, ${msgBody}, ${body.audience}, ${body.ctaLink ?? null}, ${body.category ?? null}, ${admin.id}::uuid)
      RETURNING id
    `;
    await this.audit.log({
      adminId: admin.id, action: 'broadcast.template_create', resourceType: 'broadcast_template',
      resourceId: rows[0]!.id, changes: { name, category: body.category }, ipAddress: req.ip ?? null,
    });
    return { id: rows[0]!.id, ok: true };
  }

  @Post('templates/:id/use')
  @Roles('super_admin', 'ops', 'support')
  async markTemplateUsed(@Param('id') id: string) {
    await this.prisma.$executeRaw`
      UPDATE broadcast_templates
         SET used_count = used_count + 1, last_used_at = NOW()
       WHERE id = ${id}::uuid
    `;
    return { ok: true };
  }

  @Delete('templates/:id')
  @Roles('super_admin', 'ops')
  async deleteTemplate(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`DELETE FROM broadcast_templates WHERE id = ${id}::uuid`;
    await this.audit.log({
      adminId: admin.id, action: 'broadcast.template_delete', resourceType: 'broadcast_template',
      resourceId: id, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Get('history')
  @Roles('super_admin', 'ops', 'support')
  async history() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT a.id, a.changes, a.performed_at AS "performedAt",
             u.email AS "adminEmail", u.name AS "adminName"
        FROM admin_audit_log a
        LEFT JOIN admin_users u ON u.id = a.admin_id
       WHERE a.action = 'broadcast.send'
       ORDER BY a.performed_at DESC LIMIT 50
    `;
  }

  private audienceWhere(audience: Audience): string {
    switch (audience) {
      case 'customer': return `AND u.is_customer = TRUE AND (u.status = 'active' OR u.status IS NULL)`;
      case 'cleaner': return `AND u.is_freelancer = TRUE AND (u.status = 'active' OR u.status IS NULL)`;
      case 'kyc_approved': return `AND u.is_freelancer = TRUE AND EXISTS (SELECT 1 FROM cleaner_profiles cp WHERE cp.user_id = u.id AND cp.kyc_status = 'approved')`;
      case 'new_customer_7d': return `AND u.is_customer = TRUE AND u.created_at >= NOW() - INTERVAL '7 days'`;
      case 'inactive_30d': return `AND u.is_customer = TRUE AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = u.id AND b.created_at >= NOW() - INTERVAL '30 days')`;
      case 'all':
      default: return `AND (u.status = 'active' OR u.status IS NULL)`;
    }
  }
}
