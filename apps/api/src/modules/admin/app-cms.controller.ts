import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AbuseLimitsService } from '../../common/abuse-limits.service';
import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import { ReferralRedirectController } from '../referral/referral-redirect.controller';

@ApiTags('admin-app-cms')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/app')
export class AdminAppCmsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
    private readonly abuse: AbuseLimitsService,
  ) {}

  @Post('storage/configure-cors')
  @Roles('super_admin')
  async setupCors(@CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const results = await this.storage.configureCors();
    await this.audit.log({ adminId: admin.id, action: 'storage.cors_setup', resourceType: 'r2', changes: { results }, ipAddress: req.ip ?? null });
    return { results };
  }

  // =========== APP CONFIG ===========
  @Get('config')
  @Roles('super_admin', 'ops')
  async listConfig() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT key, value, description, category, updated_at AS "updatedAt"
        FROM app_config ORDER BY category ASC, key ASC
    `;
  }

  // Upsert single config key (value is any JSON-serializable).
  @Patch('config/:key')
  @Roles('super_admin', 'ops')
  async setConfig(
    @Param('key') key: string,
    @Body() body: { value: unknown; description?: string; category?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (body?.value === undefined) throw new BadRequestException('value wajib.');
    const valueJson = JSON.stringify(body.value);
    await this.prisma.$executeRaw`
      INSERT INTO app_config (key, value, description, category, updated_by, updated_at)
      VALUES (${key}, ${valueJson}::jsonb, ${body.description ?? null}, ${body.category ?? 'general'}, ${admin.id}::uuid, NOW())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            description = COALESCE(EXCLUDED.description, app_config.description),
            category = COALESCE(EXCLUDED.category, app_config.category),
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
    `;
    await this.audit.log({ adminId: admin.id, action: 'app_config.set', resourceType: 'app_config', changes: { key, value: body.value }, ipAddress: req.ip ?? null });
    // Invalidate email config cache when email keys change
    if (key.startsWith('email.')) this.email.invalidateCache();
    if (key.startsWith('app.')) ReferralRedirectController.invalidateCache();
    if (key.startsWith('abuse.')) this.abuse.invalidate();
    return { ok: true };
  }

  @Post('email/test')
  @Roles('super_admin', 'ops')
  async testEmail(
    @Body() body: { to: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.to) throw new BadRequestException('to wajib (email tujuan).');
    this.email.invalidateCache(); // pakai config terbaru
    const result = await this.email.send({
      to: body.to,
      subject: 'Test Email — JasaBersih Admin',
      html: '<p>Halo! Ini email tes dari Admin Dashboard JasaBersih. Kalau kamu nerima ini, konfigurasi Resend kamu sudah benar 🎉</p>',
      text: 'Halo! Ini email tes dari Admin Dashboard JasaBersih. Konfigurasi Resend kamu sudah benar.',
    });
    await this.audit.log({ adminId: admin.id, action: 'email.test', resourceType: 'email', changes: { to: body.to, ok: result.ok, error: result.error }, ipAddress: req.ip ?? null });
    return result;
  }

  @Delete('config/:key')
  @Roles('super_admin')
  async deleteConfig(@Param('key') key: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`DELETE FROM app_config WHERE key = ${key}`;
    await this.audit.log({ adminId: admin.id, action: 'app_config.delete', resourceType: 'app_config', changes: { key }, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // =========== HOURLY TIERS (per-jam booking pricing) ===========
  @Get('hourly-tiers')
  @Roles('super_admin', 'ops')
  async listHourlyTiers() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, code, name, description,
             price_per_hour AS "pricePerHour",
             min_hours AS "minHours",
             max_hours AS "maxHours",
             cleaner_share_pct AS "cleanerSharePct",
             is_active AS "isActive",
             display_order AS "displayOrder",
             updated_at AS "updatedAt"
        FROM pricing_hourly_tiers
       ORDER BY display_order ASC, price_per_hour ASC
    `;
  }

  @Post('hourly-tiers')
  @Roles('super_admin', 'ops')
  async createHourlyTier(
    @Body() body: { code: string; name: string; description?: string; pricePerHour: number; minHours?: number; maxHours?: number; cleanerSharePct?: number; displayOrder?: number; isActive?: boolean },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.code || !body?.name || !body?.pricePerHour) {
      throw new BadRequestException('code, name, pricePerHour wajib.');
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO pricing_hourly_tiers
        (code, name, description, price_per_hour, min_hours, max_hours, cleaner_share_pct, is_active, display_order)
      VALUES
        (${body.code}, ${body.name}, ${body.description ?? null},
         ${body.pricePerHour}, ${body.minHours ?? 2}, ${body.maxHours ?? 8},
         ${body.cleanerSharePct ?? 60}, ${body.isActive ?? true}, ${body.displayOrder ?? 0})
      RETURNING id
    `;
    await this.audit.log({ adminId: admin.id, action: 'hourly_tier.create', resourceType: 'pricing_hourly_tiers', resourceId: rows[0]?.id, changes: body, ipAddress: req.ip ?? null });
    return { id: rows[0]?.id };
  }

  @Patch('hourly-tiers/:id')
  @Roles('super_admin', 'ops')
  async updateHourlyTier(
    @Param('id') id: string,
    @Body() body: { code?: string; name?: string; description?: string | null; pricePerHour?: number; minHours?: number; maxHours?: number; cleanerSharePct?: number; displayOrder?: number; isActive?: boolean },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    await this.prisma.$executeRaw`
      UPDATE pricing_hourly_tiers SET
        code              = COALESCE(${body.code ?? null}, code),
        name              = COALESCE(${body.name ?? null}, name),
        description       = COALESCE(${body.description ?? null}, description),
        price_per_hour    = COALESCE(${body.pricePerHour ?? null}, price_per_hour),
        min_hours         = COALESCE(${body.minHours ?? null}, min_hours),
        max_hours         = COALESCE(${body.maxHours ?? null}, max_hours),
        cleaner_share_pct = COALESCE(${body.cleanerSharePct ?? null}, cleaner_share_pct),
        display_order     = COALESCE(${body.displayOrder ?? null}, display_order),
        is_active         = COALESCE(${body.isActive ?? null}, is_active),
        updated_at        = NOW()
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({ adminId: admin.id, action: 'hourly_tier.update', resourceType: 'pricing_hourly_tiers', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Delete('hourly-tiers/:id')
  @Roles('super_admin')
  async deleteHourlyTier(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    // Soft-disable supaya booking history yg FK ke tier ini gak putus
    await this.prisma.$executeRaw`UPDATE pricing_hourly_tiers SET is_active = FALSE, updated_at = NOW() WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'hourly_tier.disable', resourceType: 'pricing_hourly_tiers', resourceId: id, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // =========== SUBSCRIPTION TIERS (Basic/Standard/Premium/Ultimate) ===========
  @Get('subscription-tiers')
  @Roles('super_admin', 'ops')
  async listSubscriptionTiers() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, code, label, tagline, multiplier, scope,
             is_active AS "isActive", display_order AS "displayOrder",
             updated_at AS "updatedAt"
        FROM subscription_tiers ORDER BY display_order ASC
    `;
  }

  @Patch('subscription-tiers/:id')
  @Roles('super_admin', 'ops')
  async updateSubscriptionTier(
    @Param('id') id: string,
    @Body() body: { label?: string; tagline?: string; multiplier?: number; scope?: string[]; isActive?: boolean; displayOrder?: number },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    await this.prisma.$executeRaw`
      UPDATE subscription_tiers SET
        label         = COALESCE(${body.label ?? null}, label),
        tagline       = COALESCE(${body.tagline ?? null}, tagline),
        multiplier    = COALESCE(${body.multiplier ?? null}, multiplier),
        scope         = COALESCE(${body.scope ? JSON.stringify(body.scope) : null}::jsonb, scope),
        is_active     = COALESCE(${body.isActive ?? null}, is_active),
        display_order = COALESCE(${body.displayOrder ?? null}, display_order),
        updated_at    = NOW()
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({ adminId: admin.id, action: 'subscription_tier.update', resourceType: 'subscription_tiers', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // =========== POPUPS ===========
  @Get('popups')
  @Roles('super_admin', 'ops')
  async listPopups() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.id, p.title, p.body, p.image_url AS "imageUrl",
             p.cta_label AS "ctaLabel", p.cta_link AS "ctaLink",
             p.audience, p.trigger_event AS "triggerEvent",
             p.max_show_per_user AS "maxShowPerUser",
             p.starts_at AS "startsAt", p.ends_at AS "endsAt",
             p.is_active AS "isActive", p.priority,
             (SELECT COUNT(*)::int FROM popup_views WHERE popup_id = p.id) AS "viewCount",
             (SELECT COUNT(*)::int FROM popup_views WHERE popup_id = p.id AND cta_clicked_at IS NOT NULL) AS "clickCount"
        FROM app_popups p ORDER BY p.priority DESC, p.created_at DESC LIMIT 100
    `;
  }

  @Post('popups')
  @Roles('super_admin', 'ops')
  async createPopup(
    @Body() body: any,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.title) throw new BadRequestException('title wajib.');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO app_popups (title, body, image_url, cta_label, cta_link, audience, trigger_event, max_show_per_user, starts_at, ends_at, priority, created_by)
      VALUES (
        ${body.title},
        ${body.body ?? null},
        ${body.imageUrl ?? null},
        ${body.ctaLabel ?? null},
        ${body.ctaLink ?? null},
        ${body.audience ?? 'all'},
        ${body.triggerEvent ?? 'app_open'},
        ${body.maxShowPerUser ?? 1}::int,
        ${body.startsAt ? body.startsAt : null}::timestamptz,
        ${body.endsAt ? body.endsAt : null}::timestamptz,
        ${body.priority ?? 0}::int,
        ${admin.id}::uuid
      ) RETURNING id
    `;
    const id = rows[0]?.id;
    await this.audit.log({ adminId: admin.id, action: 'popup.create', resourceType: 'popup', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { id };
  }

  @Patch('popups/:id')
  @Roles('super_admin', 'ops')
  async updatePopup(@Param('id') id: string, @Body() body: any, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const map: Record<string, string> = {
      title: 'title', body: 'body', imageUrl: 'image_url', ctaLabel: 'cta_label', ctaLink: 'cta_link',
      audience: 'audience', triggerEvent: 'trigger_event', maxShowPerUser: 'max_show_per_user',
      startsAt: 'starts_at', endsAt: 'ends_at', isActive: 'is_active', priority: 'priority',
    };
    for (const [k, col] of Object.entries(map)) {
      if (body[k] === undefined) continue;
      const v = body[k];
      if (k === 'maxShowPerUser' || k === 'priority') await this.prisma.$executeRawUnsafe(`UPDATE app_popups SET ${col} = $1::int, updated_at = NOW() WHERE id = $2::uuid`, v, id);
      else if (k === 'isActive') await this.prisma.$executeRawUnsafe(`UPDATE app_popups SET ${col} = $1::boolean, updated_at = NOW() WHERE id = $2::uuid`, v, id);
      else if (k === 'startsAt' || k === 'endsAt') await this.prisma.$executeRawUnsafe(`UPDATE app_popups SET ${col} = $1::timestamptz, updated_at = NOW() WHERE id = $2::uuid`, v, id);
      else await this.prisma.$executeRawUnsafe(`UPDATE app_popups SET ${col} = $1, updated_at = NOW() WHERE id = $2::uuid`, v, id);
    }
    await this.audit.log({ adminId: admin.id, action: 'popup.update', resourceType: 'popup', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Delete('popups/:id')
  @Roles('super_admin', 'ops')
  async deletePopup(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`DELETE FROM app_popups WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'popup.delete', resourceType: 'popup', resourceId: id, ipAddress: req.ip ?? null });
    return { ok: true };
  }
}
