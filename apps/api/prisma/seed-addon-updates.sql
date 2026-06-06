-- ============================================================
-- Update add-ons: queen bed (rename twin) + sofa wet/dry distinction
-- ============================================================

BEGIN;

-- Rename Twin Bed -> Queen Bed (lebih umum di Indonesia)
UPDATE add_ons
   SET name = 'Vakum Kasur Queen Bed',
       description = 'per kasur (queen, ±160×200)'
 WHERE code = 'vakum_kasur_twin';

UPDATE add_ons SET code = 'vakum_kasur_queen' WHERE code = 'vakum_kasur_twin';

-- Rename Sofa Kering -> Sofa Dry Clean (lebih clear)
UPDATE add_ons
   SET name = 'Cuci Sofa Dry Clean',
       description = 'per dudukan · tanpa air, untuk noda ringan'
 WHERE code = 'cuci_sofa_kering';

-- Tambah Cuci Sofa Wet Clean (variant baru)
INSERT INTO add_ons (id, code, name, price, duration_min, description, is_active)
VALUES (
  uuid_generate_v4(),
  'cuci_sofa_wet',
  'Cuci Sofa Wet Clean',
  90000,
  35,
  'per dudukan · pakai air & cairan, untuk noda berat',
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  duration_min = EXCLUDED.duration_min,
  description = EXCLUDED.description,
  is_active = true;

-- Tambah Vacuum & Mop Lantai sebagai add-on (sebelumnya standalone service)
INSERT INTO add_ons (id, code, name, price, duration_min, description, is_active)
VALUES (
  uuid_generate_v4(),
  'vacuum_mop_lantai',
  'Vacuum & Mop Lantai',
  120000,
  90,
  'per ruangan · vacuum + pel seluruh area',
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  duration_min = EXCLUDED.duration_min,
  description = EXCLUDED.description,
  is_active = true;

-- Nonaktifkan service standalone vacuum_lantai (jadi add-on only)
UPDATE pricing_packages SET is_active = false
 WHERE service_id = (SELECT id FROM services WHERE code = 'vacuum_lantai');
UPDATE services SET is_active = false WHERE code = 'vacuum_lantai';

COMMIT;

-- Verify
SELECT code, name, price, description FROM add_ons
 WHERE code IN ('vakum_kasur_queen', 'cuci_sofa_kering', 'cuci_sofa_wet') OR code LIKE 'vakum_kasur_%'
 ORDER BY price;
