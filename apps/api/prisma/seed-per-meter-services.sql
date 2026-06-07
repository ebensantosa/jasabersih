-- ============================================================
-- Add commercial / apartment services with PER-METER pricing
-- Pricing = area_m² × rate_per_m² (rate disimpan di app_config)
-- ============================================================

BEGIN;

-- Services baru (atau reactivate kalau pernah ada)
INSERT INTO services (id, code, name, description, is_active, display_order) VALUES
  (uuid_generate_v4(), 'ruko',      'Ruko',      'Bersih ruko / toko (per m²)',            true, 20),
  (uuid_generate_v4(), 'kantor',    'Kantor',    'Bersih kantor / coworking (per m²)',     true, 21),
  (uuid_generate_v4(), 'apartemen', 'Apartemen', 'Bersih unit apartemen (per m²)',         true, 22)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  display_order = EXCLUDED.display_order;

-- Package "shell" supaya schema FK booking valid (price=0 karena per-meter).
-- Real price dihitung di frontend dari area × rate_per_m².
INSERT INTO pricing_packages (id, service_id, name, price, duration_min, scope, is_active)
VALUES
  (
    uuid_generate_v4(),
    (SELECT id FROM services WHERE code='ruko'),
    'Ruko (per m²)',
    0,
    60,
    '{"note": "Bersih area ruko / toko. Pricing per m². Termasuk: sapu, pel, lap rak/etalase, kaca depan, sampah.", "includes": ["Sapu & pel seluruh lantai", "Lap rak / etalase / display", "Bersih kaca depan & jendela", "Bersih dinding & pilar", "Buang sampah area", "Bersih kamar mandi (jika ada)"], "perMeter": true, "category": "ruko"}'::jsonb,
    true
  ),
  (
    uuid_generate_v4(),
    (SELECT id FROM services WHERE code='kantor'),
    'Kantor (per m²)',
    0,
    60,
    '{"note": "Bersih area kantor / coworking. Pricing per m². Tanpa data sensitif — kami tidak buka dokumen / drawer.", "includes": ["Sapu & pel lantai", "Lap meja kerja & kursi", "Bersih dispenser / pantry kecil", "Bersih kaca jendela", "Buang sampah", "Bersih kamar mandi (jika ada)"], "perMeter": true, "category": "kantor"}'::jsonb,
    true
  ),
  (
    uuid_generate_v4(),
    (SELECT id FROM services WHERE code='apartemen'),
    'Apartemen (per m²)',
    0,
    90,
    '{"note": "Bersih unit apartemen. Pricing per m². Untuk studio / 1BR / 2BR. Khusus area: kamar + KM + dapur + ruang tengah.", "includes": ["Bersih kamar tidur (semua)", "Bersih kamar mandi (semua)", "Bersih dapur + kompor luar", "Bersih ruang tengah / TV", "Lap kaca jendela & balkon", "Sapu & pel seluruh area", "Buang sampah"], "perMeter": true, "category": "apartemen"}'::jsonb,
    true
  );

-- Per-meter rates di app_config (admin bisa edit)
INSERT INTO app_config (key, value, category, description)
VALUES
  ('pricing.per_meter_ruko',      '6000'::jsonb,  'pricing', 'Tarif bersih ruko per m² (Rupiah).'),
  ('pricing.per_meter_kantor',    '5500'::jsonb,  'pricing', 'Tarif bersih kantor per m² (Rupiah).'),
  ('pricing.per_meter_apartemen', '8000'::jsonb,  'pricing', 'Tarif bersih apartemen per m² (Rupiah).'),
  ('pricing.per_meter_minimum',   '150000'::jsonb,'pricing', 'Harga minimum per booking per-meter (Rupiah).')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

COMMIT;

-- Verify
SELECT s.code, s.name, p.name AS package, p.scope->>'note' AS note, p.scope->>'perMeter' AS per_meter
  FROM services s LEFT JOIN pricing_packages p ON p.service_id = s.id AND p.is_active
 WHERE s.code IN ('ruko', 'kantor', 'apartemen') AND s.is_active
 ORDER BY s.display_order;
SELECT key, value FROM app_config WHERE key LIKE 'pricing.per_meter%';
