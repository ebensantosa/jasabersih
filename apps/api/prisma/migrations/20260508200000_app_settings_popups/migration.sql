-- App-wide settings (key/value singleton-ish) + pop-up promo
-- Idempotent.

CREATE TABLE IF NOT EXISTS app_config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',     -- general | branding | typography | feature | contact
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default config (safe defaults — admin can override)
INSERT INTO app_config (key, value, category, description) VALUES
  ('brand.app_name',          '"JasaBersih"',                                              'branding',   'Nama app (di header)'),
  ('brand.tagline',           '"Bersih kapan aja, gampang."',                              'branding',   'Tagline di splash / hero'),
  ('brand.logo_url',          'null',                                                       'branding',   'URL logo (R2 public)'),
  ('brand.primary_color',     '"#1D4ED8"',                                                  'branding',   'Warna utama (hex)'),
  ('brand.secondary_color',   '"#0EA5E9"',                                                  'branding',   'Warna sekunder (hex)'),
  ('typography.font_family',  '"Inter"',                                                    'typography', 'Font family — Inter / Poppins / Plus Jakarta Sans'),
  ('typography.base_size',    '14',                                                         'typography', 'Base font size (px)'),
  ('contact.whatsapp',        '"6281234567890"',                                            'contact',    'No WA admin (untuk CS / fallback)'),
  ('contact.email',           '"halo@jasabersih.com"',                                      'contact',    'Email CS'),
  ('contact.phone',           '"021-12345678"',                                             'contact',    'Telp CS (opsional)'),
  ('feature.cancel_window_sec','120',                                                       'feature',    'Detik free-cancel setelah confirm'),
  ('feature.cancel_penalty_pct','25',                                                       'feature',    '% penalty kalau cancel di luar window'),
  ('feature.min_withdrawal',  '50000',                                                      'feature',    'Min penarikan cleaner (Rp)'),
  ('feature.max_addresses',   '5',                                                          'feature',    'Max alamat tersimpan per user'),
  ('hero.subtitle',           '"Cleaner terpercaya, harga jelas, garansi pekerjaan."',     'general',    'Subtitle di home hero'),
  ('hero.cta_label',          '"Pesan Sekarang"',                                          'general',    'CTA di hero')
ON CONFLICT (key) DO NOTHING;

-- POP-UP PROMO ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_popups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  body TEXT,
  image_url VARCHAR(500),                      -- R2 public, opsional
  cta_label VARCHAR(100),                      -- e.g. "Klaim Voucher"
  cta_link VARCHAR(500),                       -- deep link / external URL
  audience VARCHAR(20) DEFAULT 'all',          -- all | customer | cleaner | new_customer
  trigger_event VARCHAR(50) DEFAULT 'app_open',-- app_open | booking_complete | post_login
  max_show_per_user INT DEFAULT 1,             -- 0 = unlimited
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 0,                      -- higher shows first
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_popups_active_window ON app_popups(is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_popups_trigger ON app_popups(trigger_event, audience);

-- Track popup view per user (untuk max_show_per_user)
CREATE TABLE IF NOT EXISTS popup_views (
  popup_id UUID REFERENCES app_popups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  view_count INT DEFAULT 1,
  last_viewed_at TIMESTAMPTZ DEFAULT NOW(),
  cta_clicked_at TIMESTAMPTZ,
  PRIMARY KEY (popup_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_popup_views_user ON popup_views(user_id);
