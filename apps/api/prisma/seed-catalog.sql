-- ============================================================
-- Seed Catalog (PDF official price list)
-- Non-destructive: deactivates old packages/addons, inserts new.
-- Idempotent: safe to run multiple times.
-- ============================================================

BEGIN;

-- ============ 1. SERVICES (upsert by code) ============
INSERT INTO services (id, code, name, description, is_active, display_order) VALUES
  (uuid_generate_v4(), 'kamar',          'Kamar Tidur',    'Bersih kamar tidur standar',          true, 1),
  (uuid_generate_v4(), 'kamar_km_dalam', 'Kamar + Toilet', 'Kamar tidur + kamar mandi dalam',     true, 2),
  (uuid_generate_v4(), 'kamar_mandi',    'Toilet',         'Kamar mandi / toilet',                true, 3),
  (uuid_generate_v4(), 'dapur',          'Dapur',          'Area dapur lengkap',                  true, 4),
  (uuid_generate_v4(), 'ruang_tamu',     'Ruang Tamu',     'Ruang tamu & keluarga',               true, 5),
  (uuid_generate_v4(), 'pindah_kos',     'Pindah Kost',    'Cleaning kamar kos (kosongan)',       true, 6),
  (uuid_generate_v4(), 'vacuum_lantai',  'Vacuum',         'Vacuum lantai seluruh ruangan',       true, 7),
  (uuid_generate_v4(), 'garasi',         'Garasi/Teras',   'Garasi & teras depan',                true, 8),
  (uuid_generate_v4(), 'pekarangan',     'Pekarangan',     'Halaman / taman rumah',               true, 9)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  display_order = EXCLUDED.display_order;

-- ============ 2. PACKAGES — 1 per service ============
-- Soft-delete semua package lama (biar gak duplikat di UI), lalu insert 1 paket baru per service.
-- Booking lama yang refer ke package lama tetap valid (FK gak diputus).
UPDATE pricing_packages SET is_active = false;

INSERT INTO pricing_packages (id, service_id, name, price, duration_min, scope, is_active) VALUES
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='kamar'),          'Kamar Tidur',    120000, 90,  '"Bersih kamar tidur standar"'::jsonb,         true),
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='kamar_km_dalam'), 'Kamar + Toilet', 160000, 120, '"Kamar tidur + kamar mandi dalam"'::jsonb,    true),
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='kamar_mandi'),    'Toilet',         120000, 90,  '"Kamar mandi / toilet"'::jsonb,               true),
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='dapur'),          'Dapur',          160000, 120, '"Area dapur lengkap"'::jsonb,                 true),
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='ruang_tamu'),     'Ruang Tamu',     150000, 90,  '"Ruang tamu & keluarga"'::jsonb,              true),
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='pindah_kos'),     'Pindah Kost',    200000, 180, '"Serah terima kamar kos"'::jsonb,             true),
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='vacuum_lantai'),  'Vacuum',         120000, 90,  '"Vacuum lantai seluruh area"'::jsonb,         true),
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='garasi'),         'Garasi/Teras',   130000, 90,  '"Garasi atau teras depan"'::jsonb,            true),
  (uuid_generate_v4(), (SELECT id FROM services WHERE code='pekarangan'),     'Pekarangan',     150000, 120, '"Area outdoor / taman"'::jsonb,               true);

-- ============ 3. ADD-ONS ============
-- Soft-delete semua add-on lama, lalu insert list lengkap dari PDF.
UPDATE add_ons SET is_active = false;

INSERT INTO add_ons (id, code, name, price, duration_min, description, is_active) VALUES
  -- Vakum Kasur
  (uuid_generate_v4(), 'vakum_kasur_single', 'Vakum Kasur Single Bed',        45000,  20, 'per kasur',          true),
  (uuid_generate_v4(), 'vakum_kasur_twin',   'Vakum Kasur Twin Bed',          60000,  25, 'per kasur',          true),
  (uuid_generate_v4(), 'vakum_kasur_master', 'Vakum Kasur Master Bed',        75000,  30, 'per kasur',          true),
  -- Bak Mandi / Bathtub
  (uuid_generate_v4(), 'bathtub_general',    'Bak Mandi / Bathtub (General)', 30000,  20, 'per unit',           true),
  (uuid_generate_v4(), 'bathtub_deep',       'Bak Mandi / Bathtub (Deep)',    50000,  40, 'per unit',           true),
  -- Hydro Vacuum Kasur
  (uuid_generate_v4(), 'hydro_100x200',      'Hydro Vacuum Kasur 100×200',    250000, 60, 'per kasur',          true),
  (uuid_generate_v4(), 'hydro_120x200',      'Hydro Vacuum Kasur 120×200',    270000, 60, 'per kasur',          true),
  (uuid_generate_v4(), 'hydro_140x200',      'Hydro Vacuum Kasur 140×200',    290000, 75, 'per kasur',          true),
  (uuid_generate_v4(), 'hydro_160x200',      'Hydro Vacuum Kasur 160×200',    310000, 75, 'per kasur',          true),
  (uuid_generate_v4(), 'hydro_180x200',      'Hydro Vacuum Kasur 180×200',    330000, 90, 'per kasur',          true),
  (uuid_generate_v4(), 'hydro_200x200',      'Hydro Vacuum Kasur 200×200',    350000, 90, 'per kasur',          true),
  (uuid_generate_v4(), 'hydro_bantal',       'Hydro Vacuum Bantal / Guling',  70000,  20, 'per pcs',            true),
  (uuid_generate_v4(), 'hydro_sofa',         'Hydro Vacuum Sofa',             80000,  30, 'per dudukan',        true),
  -- Dapur & Peralatan
  (uuid_generate_v4(), 'cuci_piring',        'Cuci Piring',                   30000,  20, 'per sink (max 20 pcs)', true),
  (uuid_generate_v4(), 'cuci_alat_masak',    'Cuci Peralatan Masak',          40000,  25, 'max 10 pcs',         true),
  (uuid_generate_v4(), 'kulkas',             'Bersihkan Kulkas',              75000,  40, 'dalam + luar',       true),
  (uuid_generate_v4(), 'kompor',             'Bersihkan Kompor Gas',          50000,  30, 'termasuk grill',     true),
  (uuid_generate_v4(), 'microwave_oven',     'Bersihkan Microwave / Oven',    50000,  25, 'dalam + luar',       true),
  (uuid_generate_v4(), 'hood_exhaust',       'Bersihkan Hood / Exhaust Fan',  65000,  35, 'per unit',           true),
  (uuid_generate_v4(), 'dispenser',          'Bersihkan Dispenser',           25000,  15, 'luar + area bawah',  true),
  -- Kamar Mandi Ekstra
  (uuid_generate_v4(), 'sikat_keramik',      'Sikat Keramik Dinding',         30000,  20, 'per m²',             true),
  (uuid_generate_v4(), 'shower_head',        'Bersihkan Shower Head',         25000,  15, 'per unit',           true),
  (uuid_generate_v4(), 'poles_kaca_shower',  'Poles Kaca Shower / Cermin',    25000,  15, 'per unit',           true),
  (uuid_generate_v4(), 'saluran_air',        'Bersihkan Saluran Air',         25000,  15, 'per lubang',         true),
  -- Furniture & Kaca
  (uuid_generate_v4(), 'lap_kaca_jendela',   'Lap Kaca Jendela',              15000,  10, 'per daun',           true),
  (uuid_generate_v4(), 'cuci_sofa_kering',   'Cuci Sofa Kering',              50000,  25, 'per dudukan',        true),
  (uuid_generate_v4(), 'lemari_kayu',        'Lap / Poles Lemari Kayu',       40000,  30, 'dalam + luar',       true),
  (uuid_generate_v4(), 'angkut_furniture',   'Angkut / Pindah Furniture',     30000,  15, 'per item',           true),
  -- Sampah & Pembuangan
  (uuid_generate_v4(), 'sampah',             'Buang Sampah / Trashbag',       50000,  20, 'per 1x buang',       true),
  -- Decluttering
  (uuid_generate_v4(), 'decluttering',       'Rapikan & Sortir Barang',       75000,  60, 'per jam',            true)
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  price       = EXCLUDED.price,
  duration_min= EXCLUDED.duration_min,
  description = EXCLUDED.description,
  is_active   = true;

-- ============ 4. Deep Clean multiplier (sesuai PDF rata² 1.4x) ============
UPDATE app_config
   SET value = '1.4'::jsonb
 WHERE key = 'pricing.deep_clean_multiplier';

INSERT INTO app_config (key, value)
SELECT 'pricing.deep_clean_multiplier', '1.4'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM app_config WHERE key = 'pricing.deep_clean_multiplier');

COMMIT;

-- Verify
SELECT code, name FROM services WHERE is_active = true ORDER BY display_order;
SELECT s.code AS service, p.name AS package, p.price FROM pricing_packages p JOIN services s ON s.id = p.service_id WHERE p.is_active = true ORDER BY s.display_order;
SELECT code, name, price FROM add_ons WHERE is_active = true ORDER BY price;
