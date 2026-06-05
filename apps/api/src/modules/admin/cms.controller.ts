import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('admin-cms')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/cms')
export class AdminCmsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditService,
  ) {}

  // ============ UPLOAD URL (untuk semua media CMS) ============
  // Image upload langsung ke R2 public bucket → return key + final CDN URL
  @Post('upload-url')
  @Roles('super_admin', 'ops')
  async uploadUrl(@Body() body: { contentType: string; folder: string }) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowed.includes(body?.contentType)) throw new BadRequestException(`contentType harus salah satu: ${allowed.join(', ')}`);
    const folder = body.folder?.replace(/[^a-z0-9_-]/gi, '') || 'misc';
    const r = await this.storage.createUploadUrl({
      bucket: 'public',
      keyPrefix: `cms/${folder}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
    return { ...r, publicUrl: this.storage.getPublicUrl(r.key) };
  }

  // ============ BANNERS ============
  @Get('banners')
  @Roles('super_admin', 'ops')
  async listBanners(@Query('placement') placement?: string) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, title, subtitle, image_url AS "imageUrl", link_url AS "linkUrl",
             placement, sort_order AS "sortOrder", is_active AS "isActive",
             starts_at AS "startsAt", ends_at AS "endsAt", created_at AS "createdAt"
        FROM cms_banners
       WHERE (${placement ?? null}::text IS NULL OR placement = ${placement ?? null})
       ORDER BY placement ASC, sort_order ASC, created_at DESC
    `;
  }

  @Post('banners')
  @Roles('super_admin', 'ops')
  async createBanner(
    @Body() body: { title: string; subtitle?: string; imageUrl: string; linkUrl?: string; placement?: string; sortOrder?: number; startsAt?: string; endsAt?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.title || !body?.imageUrl) throw new BadRequestException('title & imageUrl wajib.');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO cms_banners (title, subtitle, image_url, link_url, placement, sort_order, starts_at, ends_at, created_by)
      VALUES (${body.title}, ${body.subtitle ?? null}, ${body.imageUrl}, ${body.linkUrl ?? null},
              ${body.placement ?? 'home_hero'}, ${body.sortOrder ?? 0}::int,
              ${body.startsAt ?? null}::timestamptz, ${body.endsAt ?? null}::timestamptz, ${admin.id}::uuid)
      RETURNING id
    `;
    const id = rows[0]?.id;
    await this.audit.log({ adminId: admin.id, action: 'banner.create', resourceType: 'banner', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { id };
  }

  @Patch('banners/:id')
  @Roles('super_admin', 'ops')
  async updateBanner(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const map: Record<string, string> = {
      title: 'title', subtitle: 'subtitle', imageUrl: 'image_url', linkUrl: 'link_url',
      placement: 'placement', sortOrder: 'sort_order', isActive: 'is_active',
      startsAt: 'starts_at', endsAt: 'ends_at',
    };
    for (const [k, col] of Object.entries(map)) {
      if (body[k] === undefined) continue;
      const v = body[k];
      if (k === 'sortOrder') await this.prisma.$executeRawUnsafe(`UPDATE cms_banners SET ${col} = $1::int, updated_at = NOW() WHERE id = $2::uuid`, v, id);
      else if (k === 'isActive') await this.prisma.$executeRawUnsafe(`UPDATE cms_banners SET ${col} = $1::boolean, updated_at = NOW() WHERE id = $2::uuid`, v, id);
      else if (k === 'startsAt' || k === 'endsAt') await this.prisma.$executeRawUnsafe(`UPDATE cms_banners SET ${col} = $1::timestamptz, updated_at = NOW() WHERE id = $2::uuid`, v, id);
      else await this.prisma.$executeRawUnsafe(`UPDATE cms_banners SET ${col} = $1, updated_at = NOW() WHERE id = $2::uuid`, v, id);
    }
    await this.audit.log({ adminId: admin.id, action: 'banner.update', resourceType: 'banner', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Delete('banners/:id')
  @Roles('super_admin', 'ops')
  async deleteBanner(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`DELETE FROM cms_banners WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'banner.delete', resourceType: 'banner', resourceId: id, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // ============ STATIC PAGES ============
  @Get('pages')
  @Roles('super_admin', 'ops', 'support')
  async listPages() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, slug, title, audience, is_published AS "isPublished",
             updated_at AS "updatedAt", LENGTH(body_markdown) AS "bodyLength"
        FROM cms_pages ORDER BY slug ASC
    `;
  }

  @Get('pages/:slug')
  @Roles('super_admin', 'ops', 'support')
  async getPage(@Param('slug') slug: string) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, slug, title, body_markdown AS "bodyMarkdown", audience,
             is_published AS "isPublished", updated_at AS "updatedAt"
        FROM cms_pages WHERE slug = ${slug} LIMIT 1
    `;
    if (rows.length === 0) throw new BadRequestException('Page tidak ditemukan.');
    return rows[0];
  }

  @Post('pages')
  @Roles('super_admin', 'ops')
  async createPage(
    @Body() body: { slug: string; title: string; bodyMarkdown: string; audience?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.slug || !body?.title || !body?.bodyMarkdown) throw new BadRequestException('slug, title, bodyMarkdown wajib.');
    await this.prisma.$executeRaw`
      INSERT INTO cms_pages (slug, title, body_markdown, audience, updated_by)
      VALUES (${body.slug}, ${body.title}, ${body.bodyMarkdown}, ${body.audience ?? 'public'}, ${admin.id}::uuid)
      ON CONFLICT (slug) DO UPDATE
        SET title = EXCLUDED.title,
            body_markdown = EXCLUDED.body_markdown,
            audience = EXCLUDED.audience,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
    `;
    await this.audit.log({ adminId: admin.id, action: 'page.upsert', resourceType: 'cms_page', changes: { slug: body.slug, audience: body.audience }, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Patch('pages/:id/publish')
  @Roles('super_admin', 'ops')
  async publishPage(@Param('id') id: string, @Body() body: { isPublished: boolean }, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`UPDATE cms_pages SET is_published = ${body.isPublished}, updated_at = NOW() WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'page.publish', resourceType: 'cms_page', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // ============ ANNOUNCEMENTS ============
  @Get('announcements')
  @Roles('super_admin', 'ops')
  async listAnnouncements() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, title, body, audience, severity, is_active AS "isActive",
             starts_at AS "startsAt", ends_at AS "endsAt", created_at AS "createdAt"
        FROM cms_announcements ORDER BY created_at DESC LIMIT 100
    `;
  }

  @Post('announcements')
  @Roles('super_admin', 'ops')
  async createAnnouncement(
    @Body() body: { title: string; body: string; audience?: string; severity?: string; startsAt?: string; endsAt?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.title || !body?.body) throw new BadRequestException('title & body wajib.');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO cms_announcements (title, body, audience, severity, starts_at, ends_at, created_by)
      VALUES (${body.title}, ${body.body}, ${body.audience ?? 'all'}, ${body.severity ?? 'info'},
              ${body.startsAt ?? null}::timestamptz, ${body.endsAt ?? null}::timestamptz, ${admin.id}::uuid)
      RETURNING id
    `;
    const id = rows[0]?.id;
    await this.audit.log({ adminId: admin.id, action: 'announcement.create', resourceType: 'announcement', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { id };
  }

  @Patch('announcements/:id')
  @Roles('super_admin', 'ops')
  async updateAnnouncement(@Param('id') id: string, @Body() body: { isActive?: boolean; endsAt?: string }, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    if (body.isActive !== undefined) await this.prisma.$executeRaw`UPDATE cms_announcements SET is_active = ${body.isActive} WHERE id = ${id}::uuid`;
    if (body.endsAt !== undefined) await this.prisma.$executeRaw`UPDATE cms_announcements SET ends_at = ${body.endsAt}::timestamptz WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'announcement.update', resourceType: 'announcement', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // ============ SERVICE AREAS ============
  @Get('service-areas')
  @Roles('super_admin', 'ops')
  async listAreas() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, name, city, radius_m AS "radiusM", is_active AS "isActive",
             surge_multiplier AS "surgeMultiplier", notes,
             ST_X(centroid::geometry) AS lng, ST_Y(centroid::geometry) AS lat,
             created_at AS "createdAt"
        FROM service_areas ORDER BY city ASC, name ASC
    `;
  }

  @Post('service-areas')
  @Roles('super_admin', 'ops')
  async createArea(
    @Body() body: { name: string; city: string; lat: number; lng: number; radiusM?: number; surgeMultiplier?: number; notes?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.name || !body?.city || body.lat == null || body.lng == null) throw new BadRequestException('name, city, lat, lng wajib.');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO service_areas (name, city, centroid, radius_m, surge_multiplier, notes)
      VALUES (${body.name}, ${body.city},
              ST_SetSRID(ST_MakePoint(${body.lng}, ${body.lat}), 4326)::geography,
              ${body.radiusM ?? 5000}::int, ${body.surgeMultiplier ?? 1.0}, ${body.notes ?? null})
      RETURNING id
    `;
    const id = rows[0]?.id;
    await this.audit.log({ adminId: admin.id, action: 'service_area.create', resourceType: 'service_area', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { id };
  }

  @Patch('service-areas/:id')
  @Roles('super_admin', 'ops')
  async updateArea(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean; surgeMultiplier?: number; radiusM?: number; notes?: string; lat?: number; lng?: number }, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    if (body.name !== undefined) {
      await this.prisma.$executeRaw`UPDATE service_areas SET name = ${body.name}, city = ${body.name} WHERE id = ${id}::uuid`;
    }
    if (body.isActive !== undefined) await this.prisma.$executeRaw`UPDATE service_areas SET is_active = ${body.isActive} WHERE id = ${id}::uuid`;
    if (body.surgeMultiplier !== undefined) await this.prisma.$executeRaw`UPDATE service_areas SET surge_multiplier = ${body.surgeMultiplier} WHERE id = ${id}::uuid`;
    if (body.radiusM !== undefined) await this.prisma.$executeRaw`UPDATE service_areas SET radius_m = ${body.radiusM}::int WHERE id = ${id}::uuid`;
    if (body.notes !== undefined) await this.prisma.$executeRaw`UPDATE service_areas SET notes = ${body.notes} WHERE id = ${id}::uuid`;
    if (typeof body.lat === 'number' && typeof body.lng === 'number') {
      await this.prisma.$executeRawUnsafe(
        `UPDATE service_areas SET centroid = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3::uuid`,
        body.lng, body.lat, id,
      );
    }
    await this.audit.log({ adminId: admin.id, action: 'service_area.update', resourceType: 'service_area', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Delete('service-areas/:id')
  @Roles('super_admin')
  async deleteArea(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`DELETE FROM service_areas WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'service_area.delete', resourceType: 'service_area', resourceId: id, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // ============ PRICING PACKAGES (per ruangan/paket) ============
  @Get('packages')
  @Roles('super_admin', 'ops', 'finance')
  async listPackages(@Query('serviceId') serviceId?: string) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.id, p.service_id AS "serviceId", s.name AS "serviceName",
             p.name, p.price, p.duration_min AS "durationMin",
             p.scope, p.is_active AS "isActive"
        FROM pricing_packages p
        LEFT JOIN services s ON s.id = p.service_id
       WHERE (${serviceId ?? null}::uuid IS NULL OR p.service_id = ${serviceId ?? null}::uuid)
       ORDER BY s.name, p.price ASC
    `;
  }

  @Post('packages')
  @Roles('super_admin', 'ops')
  async createPackage(
    @Body() body: { serviceId: string; name: string; price: number; durationMin: number; scope?: any },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.serviceId || !body?.name || !body?.price || !body?.durationMin) throw new BadRequestException('serviceId, name, price, durationMin wajib.');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO pricing_packages (service_id, name, price, duration_min, scope, is_active)
      VALUES (${body.serviceId}::uuid, ${body.name}, ${body.price}::bigint, ${body.durationMin}::int, ${body.scope ? JSON.stringify(body.scope) : null}::jsonb, TRUE)
      RETURNING id
    `;
    const id = rows[0]?.id;
    await this.audit.log({ adminId: admin.id, action: 'package.create', resourceType: 'pricing_package', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { id };
  }

  @Patch('packages/:id')
  @Roles('super_admin', 'ops')
  async updatePackage(@Param('id') id: string, @Body() body: { name?: string; price?: number; durationMin?: number; isActive?: boolean }, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    if (body.name !== undefined) await this.prisma.$executeRaw`UPDATE pricing_packages SET name = ${body.name} WHERE id = ${id}::uuid`;
    if (body.price !== undefined) await this.prisma.$executeRaw`UPDATE pricing_packages SET price = ${body.price}::bigint WHERE id = ${id}::uuid`;
    if (body.durationMin !== undefined) await this.prisma.$executeRaw`UPDATE pricing_packages SET duration_min = ${body.durationMin}::int WHERE id = ${id}::uuid`;
    if (body.isActive !== undefined) await this.prisma.$executeRaw`UPDATE pricing_packages SET is_active = ${body.isActive} WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'package.update', resourceType: 'pricing_package', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Delete('packages/:id')
  @Roles('super_admin')
  async deletePackage(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`UPDATE pricing_packages SET is_active = FALSE WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'package.deactivate', resourceType: 'pricing_package', resourceId: id, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // ============ ADD-ONS ============
  @Get('addons')
  @Roles('super_admin', 'ops', 'finance')
  async listAddons() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, code, name, price, duration_min AS "durationMin", description, is_active AS "isActive"
        FROM add_ons ORDER BY price ASC
    `;
  }

  @Post('addons')
  @Roles('super_admin', 'ops')
  async createAddon(
    @Body() body: { code?: string; name: string; price: number; durationMin: number; description?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.name || !body?.price || !body?.durationMin) throw new BadRequestException('name, price, durationMin wajib.');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO add_ons (code, name, price, duration_min, description, is_active)
      VALUES (${body.code ?? null}, ${body.name}, ${body.price}::bigint, ${body.durationMin}::int, ${body.description ?? null}, TRUE)
      RETURNING id
    `;
    const id = rows[0]?.id;
    await this.audit.log({ adminId: admin.id, action: 'addon.create', resourceType: 'add_on', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { id };
  }

  @Patch('addons/:id')
  @Roles('super_admin', 'ops')
  async updateAddon(@Param('id') id: string, @Body() body: { name?: string; price?: number; durationMin?: number; description?: string; isActive?: boolean }, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    if (body.name !== undefined) await this.prisma.$executeRaw`UPDATE add_ons SET name = ${body.name} WHERE id = ${id}::uuid`;
    if (body.price !== undefined) await this.prisma.$executeRaw`UPDATE add_ons SET price = ${body.price}::bigint WHERE id = ${id}::uuid`;
    if (body.durationMin !== undefined) await this.prisma.$executeRaw`UPDATE add_ons SET duration_min = ${body.durationMin}::int WHERE id = ${id}::uuid`;
    if (body.description !== undefined) await this.prisma.$executeRaw`UPDATE add_ons SET description = ${body.description} WHERE id = ${id}::uuid`;
    if (body.isActive !== undefined) await this.prisma.$executeRaw`UPDATE add_ons SET is_active = ${body.isActive} WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'addon.update', resourceType: 'add_on', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Delete('addons/:id')
  @Roles('super_admin', 'ops')
  async deleteAddon(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    // Soft check: hard-delete (cuma admin-config data, gak ada FK ke booking)
    await this.prisma.$executeRaw`DELETE FROM add_ons WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'addon.delete', resourceType: 'add_on', resourceId: id, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // ============ VOUCHERS ============
  @Get('vouchers')
  @Roles('super_admin', 'ops', 'finance')
  async listVouchers() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT v.id, v.code, v.type, v.value,
             v.max_discount AS "maxDiscount", v.min_order_amount AS "minOrder",
             v.total_quota AS "totalQuota", v.used_count AS "usedCount", v.per_user_limit AS "perUserLimit",
             v.valid_from AS "validFrom", v.valid_until AS "validUntil",
             v.is_stackable AS "isStackable", v.is_active AS "isActive",
             v.targeting, v.created_at AS "createdAt"
        FROM vouchers v ORDER BY v.created_at DESC LIMIT 200
    `;
  }

  @Post('vouchers')
  @Roles('super_admin', 'ops', 'finance')
  async createVoucher(
    @Body() body: {
      code: string; type: 'percentage' | 'fixed';
      value: number; maxDiscount?: number; minOrder?: number;
      totalQuota?: number; perUserLimit?: number;
      validFrom: string; validUntil: string;
      targeting?: any; isStackable?: boolean;
    },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.code || !body?.type || !body?.value || !body?.validFrom || !body?.validUntil) {
      throw new BadRequestException('code, type, value, validFrom, validUntil wajib.');
    }
    if (!['percentage', 'fixed'].includes(body.type)) throw new BadRequestException('type harus percentage / fixed.');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO vouchers (code, type, value, max_discount, min_order_amount, total_quota, per_user_limit, valid_from, valid_until, targeting, is_stackable, is_active, created_by_admin)
      VALUES (${body.code.toUpperCase()}, ${body.type}, ${body.value}::bigint,
              ${body.maxDiscount ?? null}::bigint, ${body.minOrder ?? 0}::bigint,
              ${body.totalQuota ?? null}::int, ${body.perUserLimit ?? 1}::int,
              ${body.validFrom}::timestamptz, ${body.validUntil}::timestamptz,
              ${body.targeting ? JSON.stringify(body.targeting) : null}::jsonb,
              ${body.isStackable ?? false}, TRUE, ${admin.id}::uuid)
      RETURNING id
    `;
    const id = rows[0]?.id;
    await this.audit.log({ adminId: admin.id, action: 'voucher.create', resourceType: 'voucher', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { id };
  }

  @Patch('vouchers/:id')
  @Roles('super_admin', 'ops', 'finance')
  async updateVoucher(@Param('id') id: string, @Body() body: { isActive?: boolean; validUntil?: string; totalQuota?: number }, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    if (body.isActive !== undefined) await this.prisma.$executeRaw`UPDATE vouchers SET is_active = ${body.isActive} WHERE id = ${id}::uuid`;
    if (body.validUntil !== undefined) await this.prisma.$executeRaw`UPDATE vouchers SET valid_until = ${body.validUntil}::timestamptz WHERE id = ${id}::uuid`;
    if (body.totalQuota !== undefined) await this.prisma.$executeRaw`UPDATE vouchers SET total_quota = ${body.totalQuota}::int WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'voucher.update', resourceType: 'voucher', resourceId: id, changes: body, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  // ============ CITY REQUESTS (expansion demand) ============
  // Aggregated by city + total count + sample contacts.
  @Get('city-requests')
  @Roles('super_admin', 'ops')
  async listCityRequests() {
    return this.prisma.$queryRaw`
      SELECT lower(trim(city)) AS city,
             COUNT(*)::int AS "requestCount",
             MAX(created_at) AS "lastRequestAt",
             ARRAY_AGG(DISTINCT province) FILTER (WHERE province IS NOT NULL) AS provinces,
             json_agg(json_build_object(
               'id', id, 'contactName', contact_name, 'contactPhone', contact_phone,
               'notes', notes, 'createdAt', created_at
             ) ORDER BY created_at DESC) AS samples
        FROM city_requests
       GROUP BY lower(trim(city))
       ORDER BY "requestCount" DESC, "lastRequestAt" DESC
       LIMIT 100
    `;
  }

  @Delete('city-requests/:id')
  @Roles('super_admin', 'ops')
  async deleteCityRequest(@Param('id') id: string) {
    await this.prisma.$executeRaw`DELETE FROM city_requests WHERE id = ${id}::uuid`;
    return { ok: true };
  }
}
