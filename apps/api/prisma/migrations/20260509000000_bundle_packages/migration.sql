-- Tambah service "Paket Bundle" + 4 paket bundle siap pakai
-- Idempotent — aman re-run

INSERT INTO services (code, name, description, is_active, display_order)
VALUES (
  'paket_bundle',
  'Paket Bundle',
  'Paket lengkap untuk kebutuhan spesifik (pindahan, pasca renovasi, deep clean rumah)',
  TRUE, 99
)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Insert 4 bundle packages (idempotent via uniqueness check)
INSERT INTO pricing_packages (service_id, name, price, duration_min, scope, is_active)
SELECT s.id, p.name, p.price::bigint, p.duration_min::int, p.scope::jsonb, TRUE
FROM (VALUES
  ('Paket Pindahan Kos', 350000, 240, '{"includes":["Bersih kamar tidur full","Lap dinding & jendela","Vacuum lantai+karpet","Bersih kamar mandi","Setrika baju (sampai 20 pcs)","Cuci piring + rapikan barang"]}'),
  ('Paket Pasca Renovasi', 750000, 480, '{"includes":["Buang debu konstruksi semua ruangan","Lap kaca & jendela","Bersih sisa cat di lantai/dinding","Vacuum karpet & sofa","Bersih kamar mandi total","Lap kabinet, lemari, perabotan"]}'),
  ('Paket Rumah Lengkap', 600000, 360, '{"includes":["2 kamar tidur full","Ruang tamu + ruang keluarga","Dapur + cuci piring","2 kamar mandi","Lap kaca jendela","Vacuum karpet"]}'),
  ('Paket Apartemen Studio', 250000, 150, '{"includes":["Kamar tidur","Kamar mandi","Pantry/dapur kecil","Vacuum + pel lantai","Lap permukaan & kaca"]}')
) AS p(name, price, duration_min, scope)
CROSS JOIN (SELECT id FROM services WHERE code = 'paket_bundle' LIMIT 1) s
WHERE NOT EXISTS (
  SELECT 1 FROM pricing_packages pp WHERE pp.service_id = s.id AND pp.name = p.name
);
