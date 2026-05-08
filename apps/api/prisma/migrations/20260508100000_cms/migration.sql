-- CMS tables: banners, static pages, announcements, service areas
-- Idempotent — aman re-run.

-- BANNERS (homepage hero, promo carousel) -----------------------------
CREATE TABLE IF NOT EXISTS cms_banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  subtitle TEXT,
  image_url VARCHAR(500) NOT NULL,                  -- R2 public URL
  link_url VARCHAR(500),                             -- deep link / external
  placement VARCHAR(30) DEFAULT 'home_hero',         -- home_hero | home_promo | cleaner_home
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_banners_placement_active ON cms_banners(placement, is_active);

-- STATIC PAGES (T&C, Privacy, About, FAQ, Cleaner Guide) ---------------
CREATE TABLE IF NOT EXISTS cms_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) UNIQUE NOT NULL,                 -- 'terms', 'privacy', 'about', 'faq'
  title VARCHAR(255) NOT NULL,
  body_markdown TEXT NOT NULL,
  audience VARCHAR(20) DEFAULT 'public',             -- public | customer | cleaner
  is_published BOOLEAN DEFAULT FALSE,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANNOUNCEMENTS (in-app banner, push at next open) ----------------------
CREATE TABLE IF NOT EXISTS cms_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(20) DEFAULT 'all',                -- all | customer | cleaner
  severity VARCHAR(20) DEFAULT 'info',               -- info | warning | critical
  is_active BOOLEAN DEFAULT TRUE,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcements_active_window ON cms_announcements(is_active, starts_at, ends_at);

-- SERVICE AREAS (kota / kecamatan polygon coverage) --------------------
CREATE TABLE IF NOT EXISTS service_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  polygon GEOGRAPHY(POLYGON, 4326),                  -- nullable for centroid-only areas
  centroid GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_m INT DEFAULT 5000,                         -- if no polygon, use radius
  is_active BOOLEAN DEFAULT TRUE,
  surge_multiplier NUMERIC(3,2) DEFAULT 1.0,         -- e.g. 1.2 = 20% surge
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_areas_polygon ON service_areas USING GIST(polygon);
CREATE INDEX IF NOT EXISTS idx_service_areas_centroid ON service_areas USING GIST(centroid);
CREATE INDEX IF NOT EXISTS idx_service_areas_active ON service_areas(is_active, city);
