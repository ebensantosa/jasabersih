-- Layanan untuk area skala besar (mall, pabrik, gudang, sekolah, dll)
-- Tidak ada harga fixed — customer langsung diarahkan konsultasi WA admin
-- untuk survey + quotation.

INSERT INTO services (id, code, name, description, is_active, display_order)
VALUES (
  uuid_generate_v4(),
  'skala_besar',
  'Skala Besar',
  'Mall, pabrik, gudang, sekolah, hotel · konsultasi WA',
  true,
  25
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  display_order = EXCLUDED.display_order;

-- Update konsultasi service description biar lebih jelas
UPDATE services SET
  name = 'Konsultasi Khusus',
  description = 'Properti besar / kondisi unik · chat admin untuk quote'
WHERE code = 'konsultasi';

SELECT code, name, description FROM services WHERE code IN ('skala_besar', 'konsultasi');
