-- ============================================================
-- Add "Ruangan Kosong" service (general / deep via toggle yang udah ada)
-- Cocok untuk: ruangan kosongan pasca pindah, apartemen baru beli,
-- studio kosongan, dll.
-- ============================================================

BEGIN;

INSERT INTO services (id, code, name, description, is_active, display_order)
VALUES (
  uuid_generate_v4(),
  'ruangan_kosong',
  'Ruangan Kosong',
  'Bersih ruangan kosongan (tanpa furniture)',
  true,
  10
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  display_order = EXCLUDED.display_order;

-- Soft-delete package lama untuk ruangan_kosong (kalau pernah ada)
UPDATE pricing_packages SET is_active = false
 WHERE service_id = (SELECT id FROM services WHERE code='ruangan_kosong');

INSERT INTO pricing_packages (id, service_id, name, price, duration_min, scope, is_active)
VALUES (
  uuid_generate_v4(),
  (SELECT id FROM services WHERE code='ruangan_kosong'),
  'Ruangan Kosong',
  140000,
  100,
  '{
    "note": "Cocok untuk ruangan tanpa furniture: pasca pindah, baru beli, studio kosongan. Deep Cleaning tersedia via toggle.",
    "includes": [
      "Plafon & sarang laba-laba",
      "Lap & sapu dinding (jangkauan tangan)",
      "Bersih kusen jendela & frame pintu",
      "Lap kaca & cermin",
      "Bersih saklar, stop kontak, AC luar",
      "Sapu & pel seluruh lantai",
      "Bersih kamar mandi (jika ada)",
      "Pengharum ruangan"
    ]
  }'::jsonb,
  true
);

COMMIT;

-- Verify
SELECT s.code, s.name, p.name AS package, p.price, p.duration_min
  FROM services s LEFT JOIN pricing_packages p ON p.service_id = s.id AND p.is_active
 WHERE s.code = 'ruangan_kosong';
