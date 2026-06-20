import { Body, Controller, Get, Optional, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const PUBLIC_CONFIG_EXACT_ALLOWLIST = new Set([
  'app.latest_version',
  'app.min_version',
  'app.release_notes',
  'app.play_store_url',
  'app.app_store_url',
  'app.deep_link_scheme',
  'app.force_update',
  'payment.maintenance_notice',
  'payment.disabled_methods',
  'contact.whatsapp',
  'contact.email',
  'contact.phone',
  'feature.cancel_window_sec',
  'feature.cancel_penalty_pct',
  'feature.min_withdrawal',
  'feature.max_addresses',
  'hero.subtitle',
  'hero.cta_label',
  'home.cta_animated',
  'home.cta_image_url',
  'safety.chat_banner',
  'pricing.deep_clean_multiplier',
  'pricing.dirt_multipliers',
  'pricing.floor_surcharges_idr',
  'pricing.furniture_multipliers',
  'pricing.per_meter_ruko',
  'pricing.per_meter_kantor',
  'pricing.per_meter_apartemen',
  'pricing.per_meter_minimum',
  'booking.modes.per_room.enabled',
  'booking.modes.per_hour.enabled',
]);

const PUBLIC_CONFIG_PREFIX_ALLOWLIST = [
  'brand.',
  'typography.',
  // Pricing configs - admin-editable via /admin/app-settings, dipake mobile
  // utk hitung harga (post reno, large scale, dirt levels). Aman exposure
  // karena mobile butuh tau pricing utk display ke customer.
  'pricing.',
];

const PUBLIC_CONFIG_EXACT_SQL = Array.from(PUBLIC_CONFIG_EXACT_ALLOWLIST)
  .map((key) => `'${key.replace(/'/g, "''")}'`)
  .join(', ');

const PUBLIC_CONFIG_PREFIX_SQL = PUBLIC_CONFIG_PREFIX_ALLOWLIST
  .map((prefix) => `key LIKE '${prefix.replace(/'/g, "''")}%'`)
  .join(' OR ');

function isPublicConfigKey(key: string): boolean {
  return PUBLIC_CONFIG_EXACT_ALLOWLIST.has(key)
    || PUBLIC_CONFIG_PREFIX_ALLOWLIST.some((prefix) => key.startsWith(prefix));
}

@ApiTags('app-content')
@Controller('app')
export class AppContentController {
  constructor(private readonly prisma: PrismaService) {}

  // PUBLIC — version check untuk update prompt mobile
  @Get('version-check')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
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
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async content() {
    const [config, banners, services, addons, packages, announcement, serviceAreas, hourlyTiers, subscriptionTiers] = await Promise.all([
      this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `
        SELECT key, value
          FROM app_config
         WHERE key IN (${PUBLIC_CONFIG_EXACT_SQL})
            OR ${PUBLIC_CONFIG_PREFIX_SQL}
        `,
      ),
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
        SELECT id, name, city, radius_m AS "radiusM",
               surge_multiplier AS "surgeMultiplier",
               ROUND((ST_X(centroid::geometry))::numeric, 5) AS lng,
               ROUND((ST_Y(centroid::geometry))::numeric, 5) AS lat
          FROM service_areas WHERE is_active = TRUE ORDER BY city ASC, name ASC
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, code, name, description,
               price_per_hour AS "pricePerHour",
               min_hours AS "minHours",
               max_hours AS "maxHours",
               cleaner_share_pct AS "cleanerSharePct"
          FROM pricing_hourly_tiers WHERE is_active = TRUE ORDER BY display_order ASC, price_per_hour ASC
      `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, code, label, tagline, multiplier, scope, display_order AS "displayOrder"
          FROM subscription_tiers WHERE is_active = TRUE ORDER BY display_order ASC
      `,
    ]);

    // Convert config rows to flat object
    const configMap: Record<string, unknown> = {};
    for (const row of config as { key: string; value: unknown }[]) {
      if (!isPublicConfigKey(row.key)) continue;
      configMap[row.key] = row.value;
    }

    return {
      config: configMap,
      banners,
      services,
      addons,
      hourlyTiers,
      subscriptionTiers,
      packages,
      announcement: announcement[0] ?? null,
      serviceAreas,
    };
  }

  // Customer di kota yang belum dilayani submit request → admin lihat & prioritize.
  @Post('city-requests')
  @Throttle({ default: { ttl: 10 * 60_000, limit: 3 } })
  async submitCityRequest(@Body() body: {
    city: string; province?: string; contactName?: string; contactPhone?: string;
    notes?: string; lat?: number; lng?: number; source?: 'customer' | 'cleaner';
  }, @Req() req?: Request) {
    const city = body?.city?.trim();
    const province = body?.province?.trim();
    const contactName = body?.contactName?.trim();
    const contactPhone = body?.contactPhone?.trim();
    const notes = body?.notes?.trim();
    const source = body?.source === 'cleaner' ? 'cleaner' : 'customer';
    if (!city || city.length < 2) {
      return { ok: false, error: 'Nama kota wajib (min 2 karakter)' };
    }
    if (city.length > 100) return { ok: false, error: 'Nama kota terlalu panjang.' };
    if (province && province.length > 100) return { ok: false, error: 'Provinsi terlalu panjang.' };
    if (contactName && contactName.length > 100) return { ok: false, error: 'Nama kontak terlalu panjang.' };
    if (contactPhone && contactPhone.length > 30) return { ok: false, error: 'Nomor kontak terlalu panjang.' };
    if (notes && notes.length > 500) return { ok: false, error: 'Catatan maksimal 500 karakter.' };
    // Kalau user authenticated (JWT di header), attach user_id (untuk audit trail).
    const authUserId = (req as any)?.user?.id ?? null;
    await this.prisma.$executeRaw`
      INSERT INTO city_requests (city, province, contact_name, contact_phone, notes, lat, lng, source, user_id)
      VALUES (${city}, ${province ?? null}, ${contactName ?? null},
              ${contactPhone ?? null}, ${notes ?? null}, ${body.lat ?? null}, ${body.lng ?? null},
              ${source}, ${authUserId}::uuid)
    `;
    return { ok: true };
  }

  // Get a published static page by slug (public)
  @Get('pages/:slug')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
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
