-- Per-jam booking mode revival. Pakai table existing `pricing_hourly_tiers`
-- (dulu di-clear via 20260509250000_remove_hourly_tiers).
-- bookings.hourly_tier_id sudah FK ke pricing_hourly_tiers(id) - reuse.
--
-- Pricing strategy: premium di atas per-ruangan supaya customer default ke per-ruangan;
-- per-jam jadi pilihan untuk yang butuh fleksibilitas.

-- Tambah column yang sebelumnya gak ada di pricing_hourly_tiers
ALTER TABLE pricing_hourly_tiers
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS max_hours      INT  NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS display_order  INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Re-seed dengan harga premium
DELETE FROM pricing_hourly_tiers;

INSERT INTO pricing_hourly_tiers (code, name, description, price_per_hour, min_hours, max_hours, cleaner_share_pct, is_active, display_order)
VALUES
  ('general', 'General Cleaning', 'Sapu, pel, lap permukaan, rapikan ruangan',          90000,  2, 8, 60.00, TRUE, 1),
  ('deep',    'Deep Cleaning',    'Sela ubin, AC, dapur kerak, kamar mandi total',     125000,  2, 8, 60.00, TRUE, 2);

-- Toggle on/off di app_config. Default keduanya enabled.
INSERT INTO app_config (key, value, category, description)
VALUES
  ('booking.modes.per_room.enabled', 'true', 'booking', 'Toggle mode booking per-ruangan/paket'),
  ('booking.modes.per_hour.enabled', 'true', 'booking', 'Toggle mode booking per-jam')
ON CONFLICT (key) DO NOTHING;
