import { Body, Controller, Get, Optional, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('app-content')
@Controller('app')
export class AppContentController {
  constructor(private readonly prisma: PrismaService) {}

  // PUBLIC — version check untuk update prompt mobile
  @Get('version-check')
  async versionCheck(@Query('platform') platform?: string, @Query('version') _currentVersion?: string) {
    const rows = await this.prisma.$queryRaw<{ key: string; value: any }[]>`
      SELECT key, value FROM app_config
       WHERE key IN ('app.latest_version', 'app.min_version', 'app.release_notes', 'app.play_store_url', 'app.app_store_url', 'app.force_update')
    `;
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const unwrap = (v: any, fallback = '') => {
      if (v == null) return fallback;
      if (typeof v === 'string') return v.replace(/^"|"$/g, '');
      return v;
    };
    const isIOS = platform === 'ios';
    return {
      latestVersion: unwrap(m.get('app.latest_version'), '1.1.0'),
      minVersion: unwrap(m.get('app.min_version'), '1.0.0'),
      releaseNotes: (m.get('app.release_notes') ?? []) as string[],
      storeUrl: unwrap(m.get(isIOS ? 'app.app_store_url' : 'app.play_store_url'), ''),
      required: Boolean(m.get('app.force_update') === 'true' || m.get('app.force_update') === true),
    };
  }

  // PUBLIC — boot endpoint, no auth required.
  // Returns: config (key→value), banners, services, addons, packages,
  // active announcement (latest), commission tiers.
  @Get('content')
  async content() {
    const [config, banners, services, addons, packages, announcement, commissionTiers, serviceAreas] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`SELECT key, value FROM app_config`,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, title, subtitle, image_url AS "imageUrl", link_url AS "linkUrl",
               placement, sort_order AS "sortOrder"
          FROM cms_banners
         WHERE is_active = TRUE
           AND (starts_at IS NULL OR starts_at <= NOW())
           AND (ends_at IS NULL OR ends_at > NOW())
         ORDER BY placement, sort_order ASC
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, code, name, description, icon_url AS "iconUrl",
               cover_image_url AS "coverImageUrl",
               display_order AS "displayOrder",
               show_on_home AS "showOnHome",
               is_bundle AS "isBundle",
               is_active AS "isActive"
          FROM services ORDER BY display_order ASC NULLS LAST, name ASC
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, code, name, price, duration_min AS "durationMin", description
          FROM add_ons WHERE is_active = TRUE ORDER BY price ASC
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT p.id, p.service_id AS "serviceId", p.name, p.price, p.duration_min AS "durationMin", p.scope
          FROM pricing_packages p WHERE p.is_active = TRUE ORDER BY p.price ASC
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, title, body, severity, audience FROM cms_announcements
         WHERE is_active = TRUE
           AND (starts_at IS NULL OR starts_at <= NOW())
           AND (ends_at IS NULL OR ends_at > NOW())
         ORDER BY created_at DESC LIMIT 1
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, range_min AS "rangeMin", range_max AS "rangeMax",
               cleaner_share_no_tools AS "shareNoTools", cleaner_share_with_tools AS "shareWithTools"
          FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, name, city, radius_m AS "radiusM",
               surge_multiplier AS "surgeMultiplier",
               ST_X(centroid::geometry) AS lng, ST_Y(centroid::geometry) AS lat
          FROM service_areas WHERE is_active = TRUE ORDER BY city ASC, name ASC
      `,
    ]);

    // Convert config rows to flat object
    const configMap: Record<string, unknown> = {};
    for (const row of config as { key: string; value: unknown }[]) configMap[row.key] = row.value;

    return {
      config: configMap,
      banners,
      services,
      addons,
      hourlyTiers: [],
      packages,
      announcement: announcement[0] ?? null,
      commissionTiers,
      serviceAreas,
    };
  }

  // Customer di kota yang belum dilayani submit request → admin lihat & prioritize.
  @Post('city-requests')
  async submitCityRequest(@Body() body: {
    city: string; province?: string; contactName?: string; contactPhone?: string;
    notes?: string; lat?: number; lng?: number;
  }) {
    if (!body?.city || body.city.trim().length < 2) {
      return { ok: false, error: 'Nama kota wajib (min 2 karakter)' };
    }
    await this.prisma.$executeRaw`
      INSERT INTO city_requests (city, province, contact_name, contact_phone, notes, lat, lng)
      VALUES (${body.city.trim()}, ${body.province ?? null}, ${body.contactName ?? null},
              ${body.contactPhone ?? null}, ${body.notes ?? null}, ${body.lat ?? null}, ${body.lng ?? null})
    `;
    return { ok: true };
  }

  // Get a published static page by slug (public)
  @Get('pages/:slug')
  async page(@Query('slug') _: string, @Req() req: Request) {
    const slug = (req.params as Record<string, string>).slug;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT slug, title, body_markdown AS "bodyMarkdown", audience, updated_at AS "updatedAt"
        FROM cms_pages WHERE slug = ${slug} AND is_published = TRUE LIMIT 1
    `;
    return rows[0] ?? null;
  }

  // Active popups for current user (filter by audience + maxShowPerUser).
  // Public — but audience filter respects auth: if logged in, can target customer/cleaner.
  @Get('popups')
  @UseGuards(JwtAuthGuard)
  async popups(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.id;
    if (!userId) return [];

    // Get user role (customer/cleaner) for audience filter
    const u = await this.prisma.$queryRaw<{ is_customer: boolean; is_freelancer: boolean; created_at: Date }[]>`
      SELECT is_customer, is_freelancer, created_at FROM users WHERE id = ${userId}::uuid LIMIT 1
    `;
    const user = u[0];
    if (!user) return [];

    const isNewCustomer = user.is_customer && (Date.now() - new Date(user.created_at).getTime()) < 7 * 86400000;

    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.id, p.title, p.body, p.image_url AS "imageUrl",
             p.cta_label AS "ctaLabel", p.cta_link AS "ctaLink",
             p.trigger_event AS "triggerEvent", p.priority
        FROM app_popups p
        LEFT JOIN popup_views v ON v.popup_id = p.id AND v.user_id = ${userId}::uuid
       WHERE p.is_active = TRUE
         AND (p.starts_at IS NULL OR p.starts_at <= NOW())
         AND (p.ends_at IS NULL OR p.ends_at > NOW())
         AND (
           p.audience = 'all'
           OR (p.audience = 'customer' AND ${user.is_customer})
           OR (p.audience = 'cleaner' AND ${user.is_freelancer})
           OR (p.audience = 'new_customer' AND ${isNewCustomer})
         )
         AND (p.max_show_per_user = 0 OR COALESCE(v.view_count, 0) < p.max_show_per_user)
       ORDER BY p.priority DESC, p.created_at DESC
       LIMIT 5
    `;
  }

  @Post('popups/:id/view')
  @UseGuards(JwtAuthGuard)
  async recordView(@Req() req: Request & { user?: AuthenticatedUser }, @Body() body: { ctaClicked?: boolean }) {
    const userId = req.user?.id;
    const popupId = (req.params as Record<string, string>).id;
    if (!userId) return { ok: false };
    await this.prisma.$executeRaw`
      INSERT INTO popup_views (popup_id, user_id, view_count, last_viewed_at, cta_clicked_at)
      VALUES (${popupId}::uuid, ${userId}::uuid, 1, NOW(), ${body?.ctaClicked ? new Date() : null})
      ON CONFLICT (popup_id, user_id) DO UPDATE
        SET view_count = popup_views.view_count + 1,
            last_viewed_at = NOW(),
            cta_clicked_at = COALESCE(popup_views.cta_clicked_at, EXCLUDED.cta_clicked_at)
    `;
    return { ok: true };
  }
}
