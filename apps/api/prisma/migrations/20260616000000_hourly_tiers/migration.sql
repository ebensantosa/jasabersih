-- Per-jam booking mode. Premium pricing (di atas per-ruangan) supaya customer
-- cenderung milih per-ruangan; per-jam jadi pilihan untuk yang butuh fleksibilitas.
-- Admin bisa toggle disable per_hour atau per_room mode via app_config.

CREATE TABLE IF NOT EXISTS hourly_tiers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  description         TEXT,
  price_per_hour      BIGINT NOT NULL,
  min_hours           INT NOT NULL DEFAULT 2,
  max_hours           INT NOT NULL DEFAULT 8,
  cleaner_share_pct   NUMERIC(5,2) NOT NULL DEFAULT 60.00,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  display_order       INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO hourly_tiers (code, name, description, price_per_hour, min_hours, max_hours, cleaner_share_pct, display_order)
VALUES
  ('general', 'General Cleaning', 'Sapu, pel, lap permukaan, rapikan ruangan',  90000, 2, 8, 60.00, 1),
  ('deep',    'Deep Cleaning',    'Sela ubin, AC, dapur kerak, kamar mandi total', 125000, 2, 8, 60.00, 2)
ON CONFLICT (code) DO NOTHING;

-- Toggle on/off di app_config. Default keduanya enabled.
INSERT INTO app_config (key, value, category, description)
VALUES
  ('booking.modes.per_room.enabled', 'true', 'booking', 'Toggle mode booking per-ruangan/paket'),
  ('booking.modes.per_hour.enabled', 'true', 'booking', 'Toggle mode booking per-jam')
ON CONFLICT (key) DO NOTHING;
