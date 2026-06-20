-- Subscription tier (Basic/Standard/Premium/Ultimate) di-admin-able.
-- Sebelumnya hardcoded di apps/mobile/src/data/catalog.ts SUBSCRIPTION_TIERS.
-- Admin tidak bisa ubah scope/tagline/multiplier tanpa rebuild mobile.
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  tagline         TEXT,
  multiplier      NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  scope           JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  display_order   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed dengan nilai existing dari catalog.ts (preserve current UX)
INSERT INTO subscription_tiers (code, label, tagline, multiplier, scope, display_order)
VALUES
  ('basic', 'Basic', 'Bersih dasar harian', 1.00,
   '["Sapu & pel seluruh lantai","Buang sampah dari semua tempat","Lap permukaan meja & rak","Rapikan tempat tidur"]'::jsonb, 1),
  ('standard', 'Standard', 'Bersih menyeluruh', 1.25,
   '["Semua di Basic","Bersih kamar mandi (wastafel, kloset, lantai)","Bersih dapur (kompor, meja, sink)","Dust furniture & lemari (luar)","Cuci piring kotor yg ada"]'::jsonb, 2),
  ('premium', 'Premium', 'Deep clean + jendela', 1.50,
   '["Semua di Standard","Deep clean kamar mandi (nilam keramik, anti-kerak)","Deep clean dapur (degreasing, cuci kompor)","Lap kaca jendela bagian dalam","Bersih kipas angin / lampu gantung","Vacuum karpet & sofa (luar)"]'::jsonb, 3),
  ('ultimate', 'Ultimate', 'Lengkap seperti hotel', 1.85,
   '["Semua di Premium","Bersih AC dalam (filter, blower)","Polish furniture kayu / kulit","Lap kaca jendela luar (max lantai 2)","Steam clean sofa & karpet","Bersih appliance (kulkas, microwave, oven)","Aroma terapi + linen fresh spray"]'::jsonb, 4)
ON CONFLICT (code) DO NOTHING;
