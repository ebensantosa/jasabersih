-- Align service categories + paket dengan price list jasabersih.com
-- Sumber harga: dari spec admin (Kamar 120k, Dapur 160k, dst)

-- ============ 1. Upsert service categories ============
INSERT INTO services (code, name, description, is_active, display_order) VALUES
  ('kamar',          'Bersih Kamar',           'Kamar tidur standar',                  TRUE,  1),
  ('kamar_km_dalam', 'Kamar + KM Dalam',       'Kamar tidur dengan kamar mandi dalam', TRUE,  2),
  ('kamar_mandi',    'Toilet / Kamar Mandi',   'Bersih kamar mandi / toilet',          TRUE,  3),
  ('ruang_tamu',     'Ruang Tamu',             'Ruang tamu & keluarga',                TRUE,  4),
  ('vacuum_lantai',  'Vacuum Lantai',          'Vacuum lantai full ruangan',           TRUE,  5),
  ('dapur',          'Bersih Dapur',           'Area dapur + cuci piring',             TRUE,  6),
  ('pekarangan',     'Pekarangan',             'Halaman / pekarangan rumah',           TRUE,  7),
  ('garasi',         'Garasi / Teras',         'Bersih garasi & teras',                TRUE,  8),
  ('pindah_kos',     'Pindah Kos / Kosongan',  'Cleaning kamar kos sebelum/sesudah pindah', TRUE, 9)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      display_order = EXCLUDED.display_order,
      is_active = TRUE;

-- ============ 2. Upsert default packages per service ============
-- Setiap service punya 1 paket "Reguler" sebagai default.
INSERT INTO pricing_packages (service_id, name, price, duration_min, scope, is_active)
SELECT s.id, p.name, p.price::bigint, p.duration_min::int, p.scope::jsonb, TRUE
FROM (VALUES
  ('kamar',          'Kamar Tidur Reguler',        120000, 60,  '{"includes":["Rapikan tempat tidur","Sapu+pel","Lap permukaan","Buang sampah"]}'),
  ('kamar_km_dalam', 'Kamar + KM Dalam',           160000, 90,  '{"includes":["Bersih kamar tidur","Bersih kamar mandi dalam","Lap kaca","Sapu+pel"]}'),
  ('kamar_mandi',    'Toilet Standar',             90000,  45,  '{"includes":["Sikat lantai+dinding","Bersih kloset & wastafel","Anti-bakteri","Buang sampah"]}'),
  ('kamar_mandi',    'Toilet Besar',               120000, 60,  '{"includes":["Sikat lantai+dinding","Bersih kloset, wastafel & shower","Anti-bakteri","Buang sampah"]}'),
  ('ruang_tamu',     'Ruang Tamu Reguler',         150000, 60,  '{"includes":["Sapu+pel","Lap sofa & meja","Bersih jendela","Rapikan barang"]}'),
  ('vacuum_lantai',  'Vacuum Lantai Reguler',      120000, 45,  '{"includes":["Vacuum semua lantai keramik/vinyl","Vacuum karpet","Mop ringan"]}'),
  ('dapur',          'Bersih Dapur Reguler',       160000, 75,  '{"includes":["Cuci piring","Lap meja+kompor","Bersih wastafel","Sapu+pel","Buang sampah"]}'),
  ('pekarangan',     'Pekarangan Reguler',         150000, 60,  '{"includes":["Sapu daun","Siram tanaman","Rapikan perabot luar","Buang sampah taman"]}'),
  ('garasi',         'Garasi / Teras',             130000, 60,  '{"includes":["Sapu+pel garasi","Lap permukaan","Rapikan rak","Buang sampah"]}'),
  ('pindah_kos',     'Pindah Kos / Kosongan',      200000, 120, '{"includes":["Bersih kamar full","Sapu+pel","Lap dinding & jendela","Bersih kamar mandi","Sebelum/sesudah pindah"]}')
) AS p(service_code, name, price, duration_min, scope)
JOIN services s ON s.code = p.service_code
ON CONFLICT DO NOTHING;

-- ============ 3. Config admin-editable untuk dirt/floor/furniture ============
INSERT INTO app_config (key, value, category, description) VALUES
  ('pricing.dirt_multipliers',
   '{"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.25, "5": 1.5}',
   'pricing',
   'Multiplier harga berdasarkan tingkat kotor (1-5). Level 4-5 wajib upload foto. Default: 4=+25%, 5=+50%'),
  ('pricing.floor_surcharges_idr',
   '{"1": 0, "2": 50000, "3": 100000, ">3": 200000}',
   'pricing',
   'Biaya tambahan per lantai rumah (Rupiah). Lantai 1 gratis, lantai 2 +50k, dst'),
  ('pricing.furniture_multipliers',
   '{"Sedikit": 1.0, "Sedang": 1.0, "Padat": 1.15}',
   'pricing',
   'Multiplier furniture density. Padat = lebih banyak yang harus dipindah/dilap → +15%')
ON CONFLICT (key) DO NOTHING;
