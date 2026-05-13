-- Travel fee per booking, based on jarak ke centroid service area terdekat.
-- Config admin-editable via app_config.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS travel_fee BIGINT NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS travel_distance_km NUMERIC(6, 2);

INSERT INTO app_config (key, value, category, description) VALUES
  ('travel.per_km_idr',  '1000', 'pricing', 'Tarif travel per km (Rupiah) setelah lewat free_km'),
  ('travel.free_km',     '5',    'pricing', 'Jarak gratis dari centroid kota (km). 0–free_km tidak kena travel fee'),
  ('travel.max_km',      '15',   'pricing', 'Jarak maksimum (km). Lebih dari ini booking ditolak, arahkan ke konsultasi WA'),
  ('travel.enabled',     'true', 'pricing', 'Aktifkan travel fee. false → semua booking free transport (fase early)')
ON CONFLICT (key) DO NOTHING;
