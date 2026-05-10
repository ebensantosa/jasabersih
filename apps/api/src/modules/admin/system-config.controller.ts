import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-system-config')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/config')
export class SystemConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  // ============ COMMISSION TIERS ============
  @Get('commission-tiers')
  @Roles('super_admin', 'finance', 'ops')
  async listCommissionTiers() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, range_min AS "rangeMin", range_max AS "rangeMax",
             cleaner_share_no_tools AS "shareNoTools",
             cleaner_share_with_tools AS "shareWithTools",
             top_tier_bonus_pct AS "topTierBonusPct"
        FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
    `;
  }

  @Patch('commission-tiers/:id')
  @Roles('super_admin', 'finance')
  async updateCommissionTier(
    @Param('id') id: string,
    @Body() body: { shareNoTools?: number; shareWithTools?: number; topTierBonusPct?: number; rangeMin?: number; rangeMax?: number },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (body.shareNoTools !== undefined) {
      await this.prisma.$executeRaw`UPDATE commission_tiers SET cleaner_share_no_tools = ${body.shareNoTools} WHERE id = ${id}::uuid`;
    }
    if (body.shareWithTools !== undefined) {
      await this.prisma.$executeRaw`UPDATE commission_tiers SET cleaner_share_with_tools = ${body.shareWithTools} WHERE id = ${id}::uuid`;
    }
    if (body.topTierBonusPct !== undefined) {
      await this.prisma.$executeRaw`UPDATE commission_tiers SET top_tier_bonus_pct = ${body.topTierBonusPct} WHERE id = ${id}::uuid`;
    }
    if (body.rangeMin !== undefined) {
      await this.prisma.$executeRaw`UPDATE commission_tiers SET range_min = ${body.rangeMin}::bigint WHERE id = ${id}::uuid`;
    }
    if (body.rangeMax !== undefined) {
      await this.prisma.$executeRaw`UPDATE commission_tiers SET range_max = ${body.rangeMax}::bigint WHERE id = ${id}::uuid`;
    }
    await this.audit.log({
      adminId: admin.id,
      action: 'commission_tier.update',
      resourceType: 'commission_tier',
      resourceId: id,
      changes: body,
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // ============ SERVICES ============
  @Get('services')
  @Roles('super_admin', 'ops')
  async listServices() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, code, name, description, icon_url AS "iconUrl",
             is_active AS "isActive", display_order AS "displayOrder",
             show_on_home AS "showOnHome"
        FROM services ORDER BY display_order ASC NULLS LAST, name ASC
    `;
  }

  // Bulk reorder via drag-drop: terima array of {id, displayOrder} → batch update
  @Patch('services/reorder')
  @Roles('super_admin', 'ops')
  async reorderServices(
    @Body() body: { items: Array<{ id: string; displayOrder: number }> },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!Array.isArray(body?.items)) throw new BadRequestException('items wajib array');
    for (const it of body.items) {
      await this.prisma.$executeRaw`UPDATE services SET display_order = ${it.displayOrder}::int WHERE id = ${it.id}::uuid`;
    }
    await this.audit.log({
      adminId: admin.id, action: 'service.reorder', resourceType: 'services',
      changes: { count: body.items.length }, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Post('services')
  @Roles('super_admin', 'ops')
  async createService(
    @Body() body: { code: string; name: string; description?: string; iconUrl?: string; displayOrder?: number },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body.code || !body.name) throw new BadRequestException('code & name wajib.');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO services (code, name, description, icon_url, display_order, is_active)
      VALUES (${body.code}, ${body.name}, ${body.description ?? null}, ${body.iconUrl ?? null}, ${body.displayOrder ?? null}, TRUE)
      RETURNING id
    `;
    const newId = rows[0]?.id;
    if (!newId) throw new BadRequestException('Gagal membuat service.');
    await this.audit.log({
      adminId: admin.id,
      action: 'service.create',
      resourceType: 'service',
      resourceId: newId,
      changes: body,
      ipAddress: req.ip ?? null,
    });
    return { id: newId };
  }

  @Patch('services/:id')
  @Roles('super_admin', 'ops')
  async updateService(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; iconUrl?: string; isActive?: boolean; displayOrder?: number; showOnHome?: boolean },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (body.name !== undefined) await this.prisma.$executeRaw`UPDATE services SET name = ${body.name} WHERE id = ${id}::uuid`;
    if (body.description !== undefined) await this.prisma.$executeRaw`UPDATE services SET description = ${body.description} WHERE id = ${id}::uuid`;
    if (body.iconUrl !== undefined) await this.prisma.$executeRaw`UPDATE services SET icon_url = ${body.iconUrl} WHERE id = ${id}::uuid`;
    if (body.isActive !== undefined) await this.prisma.$executeRaw`UPDATE services SET is_active = ${body.isActive} WHERE id = ${id}::uuid`;
    if (body.displayOrder !== undefined) await this.prisma.$executeRaw`UPDATE services SET display_order = ${body.displayOrder}::int WHERE id = ${id}::uuid`;
    if (body.showOnHome !== undefined) await this.prisma.$executeRaw`UPDATE services SET show_on_home = ${body.showOnHome}::boolean WHERE id = ${id}::uuid`;
    await this.audit.log({
      adminId: admin.id,
      action: 'service.update',
      resourceType: 'service',
      resourceId: id,
      changes: body,
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Delete('services/:id')
  @Roles('super_admin')
  async deactivateService(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`UPDATE services SET is_active = FALSE WHERE id = ${id}::uuid`;
    await this.audit.log({
      adminId: admin.id,
      action: 'service.deactivate',
      resourceType: 'service',
      resourceId: id,
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // ============ BLACKLIST ============
  @Get('blacklist')
  @Roles('super_admin', 'fraud_analyst', 'ops')
  async listBlacklist() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.type, b.value, b.reason, b.added_at AS "addedAt", b.expires_at AS "expiresAt",
             u.email AS "addedByEmail"
        FROM blacklist_entries b
        LEFT JOIN admin_users u ON u.id = b.added_by
       ORDER BY b.added_at DESC LIMIT 500
    `;
  }

  @Post('blacklist')
  @Roles('super_admin', 'fraud_analyst')
  async addBlacklist(
    @Body() body: { type: string; value: string; reason: string; expiresAt?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const allowed = ['phone', 'device', 'ip', 'bank', 'nik', 'email'];
    if (!allowed.includes(body.type)) throw new BadRequestException(`type harus salah satu: ${allowed.join(', ')}`);
    if (!body.value || !body.reason) throw new BadRequestException('value & reason wajib.');
    await this.prisma.$executeRaw`
      INSERT INTO blacklist_entries (type, value, reason, added_by, expires_at)
      VALUES (${body.type}, ${body.value}, ${body.reason}, ${admin.id}::uuid, ${body.expiresAt ?? null}::timestamptz)
      ON CONFLICT (type, value) DO UPDATE SET reason = EXCLUDED.reason, added_by = EXCLUDED.added_by, added_at = NOW()
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'blacklist.add',
      resourceType: 'blacklist',
      changes: body,
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Delete('blacklist/:id')
  @Roles('super_admin', 'fraud_analyst')
  async removeBlacklist(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`DELETE FROM blacklist_entries WHERE id = ${id}::uuid`;
    await this.audit.log({
      adminId: admin.id,
      action: 'blacklist.remove',
      resourceType: 'blacklist',
      resourceId: id,
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }
}
