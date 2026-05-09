-- Tambah services tile untuk area-spesifik (Pekarangan, Garasi/Teras)
-- supaya ke-render di home grid (sebelumnya cuma jadi nama paket di general_cleaning)

INSERT INTO services (code, name, description, is_active, display_order) VALUES
  ('pekarangan', 'Pekarangan', 'Sapu daun, sirami tanaman, rapikan perabot luar', TRUE, 11),
  ('garasi',     'Garasi/Teras', 'Sapu debu, bersihkan dinding luar & perabot', TRUE, 12)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = TRUE;

-- Pindahin paket Pekarangan & Garasi dari general_cleaning ke service masing-masing
UPDATE pricing_packages
   SET service_id = (SELECT id FROM services WHERE code = 'pekarangan' LIMIT 1)
 WHERE name = 'Paket Pekarangan Rumah';

UPDATE pricing_packages
   SET service_id = (SELECT id FROM services WHERE code = 'garasi' LIMIT 1)
 WHERE name = 'Paket Garasi/Teras';

-- Pindah Kost: pastiin service 'kos' aktif & paket Pindah Kost ada di sana
INSERT INTO services (code, name, description, is_active, display_order) VALUES
  ('kos', 'Pindah Kost', 'Bersih kost saat serah terima / kosongan', TRUE, 13)
ON CONFLICT (code) DO UPDATE SET is_active = TRUE;

UPDATE pricing_packages
   SET service_id = (SELECT id FROM services WHERE code = 'kos' LIMIT 1)
 WHERE name = 'Paket Pindah Kost / Kosongan';
