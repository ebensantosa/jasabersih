-- Migrate hardcoded pricing dari apps/mobile/src/data/catalog.ts ke app_config
-- supaya admin bisa adjust via /admin/app-settings tanpa rebuild mobile.
--
-- Naming convention: pricing.<group>.<sub> sesuai prefix existing.
-- Mobile baca via useConfig() hook, fallback ke hardcoded kalau API kosong.

INSERT INTO app_config (key, value, category, description) VALUES

-- ====== POST RENO (Pasca Renovasi) ======
('pricing.post_reno.levels',
  '[
    {"code":"cat_ulang","label":"Cat Ulang / Minor","desc":"Repaint dinding, debu cat ringan, minim puing","multiplier":1.0},
    {"code":"renovasi_sedang","label":"Renovasi Sedang","desc":"Ada bongkar partisi, debu semen sedang, sisa material","multiplier":1.1},
    {"code":"renovasi_total","label":"Renovasi Total","desc":"Bongkar besar, debu semen tebal, banyak puing & sisa cat","multiplier":1.3}
  ]'::jsonb,
  'pricing', '3 level renovasi dgn multiplier harga pasca renovasi.'),

('pricing.post_reno.targets',
  '[
    {"code":"debu_semen","label":"Sapu & buang debu semen","ratePerM2":8000,"desc":"Debu konstruksi dari lantai, sudut, sela"},
    {"code":"sisa_cat","label":"Bersih sisa cat / plamir","ratePerM2":6500,"desc":"Cat menempel di lantai, kaca, kusen"},
    {"code":"kaca","label":"Lap kaca & jendela","ratePerM2":5500,"desc":"Kaca berdebu / ada residu cat"},
    {"code":"kusen","label":"Lap kusen & frame pintu","ratePerM2":4500,"desc":"Kusen pintu/jendela penuh debu konstruksi"},
    {"code":"plafon","label":"Lap plafon & langit-langit","ratePerM2":6000,"desc":"Sarang laba-laba + debu pasca cat"},
    {"code":"lantai_poles","label":"Pel + poles lantai","ratePerM2":5000,"desc":"Pel deep clean, poles bila marmer"},
    {"code":"furniture","label":"Lap furniture & kabinet","ratePerM2":4500,"desc":"Lemari, meja, kabinet built-in"},
    {"code":"puing","label":"Angkut puing kecil","ratePerM2":4000,"desc":"Sisa kayu, kardus, potongan kecil"},
    {"code":"saklar","label":"Bersih saklar & stop kontak","ratePerM2":2000,"desc":"Saklar, stop kontak, AC outdoor"}
  ]'::jsonb,
  'pricing', 'Daftar item pasca renovasi + rate per m2.'),

('pricing.post_reno.bathroom_rate', '100000', 'pricing', 'Bersih kamar mandi pasca reno (Rp/unit).'),
('pricing.post_reno.kitchen_flat', '150000', 'pricing', 'Dapur pasca reno - flat fee (Rp).'),
('pricing.post_reno.max_m2', '300', 'pricing', 'Max luas pasca reno tanpa survey lapangan.'),

-- ====== LARGE SCALE (Properti Komersial) ======
('pricing.large_scale.targets',
  '[
    {"code":"lantai","label":"Lantai / area utama","ratePerM2":5500,"desc":"Sweep, mop, vacuum lantai keseluruhan"},
    {"code":"lantai_marmer","label":"Lantai marmer / granit","ratePerM2":7500,"desc":"Polish + kristalisasi lantai marmer"},
    {"code":"karpet","label":"Karpet / vinyl","ratePerM2":5500,"desc":"Vacuum + shampoo karpet, deep clean"},
    {"code":"atap","label":"Atap / genteng","ratePerM2":8000,"desc":"Bersihin atap dari debu, lumut, daun"},
    {"code":"plafon","label":"Plafon / langit-langit","ratePerM2":6500,"desc":"Sapu sarang laba-laba, lap plafon"},
    {"code":"dinding_dalam","label":"Dinding dalam","ratePerM2":5000,"desc":"Lap dinding interior, hilangin debu & noda"},
    {"code":"dinding","label":"Dinding luar / fasad","ratePerM2":7000,"desc":"Cuci dinding luar (kotor air hujan, lumut)"},
    {"code":"kaca","label":"Jendela / kaca","ratePerM2":5500,"desc":"Lap kaca dalam + luar"},
    {"code":"kaca_tinggi","label":"Kaca tinggi / gondola","ratePerM2":12000,"desc":"Kaca gedung tinggi pakai rope access / gondola"},
    {"code":"parkir","label":"Area parkir","ratePerM2":3500,"desc":"Sapu, semprot area parkir / drop-off"},
    {"code":"tangga","label":"Tangga / koridor","ratePerM2":4000,"desc":"Mop tangga, pegangan & koridor"},
    {"code":"lift","label":"Area lift / lobby","ratePerM2":5500,"desc":"Lap dinding lift, lantai lobby"},
    {"code":"taman","label":"Taman / halaman","ratePerM2":3000,"desc":"Sapu daun, bersihin halaman terbuka"},
    {"code":"kolam","label":"Kolam / fountain","ratePerM2":9000,"desc":"Drain, sikat, refill kolam"},
    {"code":"dapur_komersial","label":"Dapur komersial","ratePerM2":8500,"desc":"Degreasing dapur, hood, lantai berminyak"},
    {"code":"gudang","label":"Gudang / warehouse","ratePerM2":3500,"desc":"Sapu lantai gudang, rak, area logistik"},
    {"code":"furniture","label":"Furniture / sofa kantor","ratePerM2":4000,"desc":"Vacuum + shampoo sofa, kursi kerja"},
    {"code":"sampah","label":"Pembersihan post-event","ratePerM2":3500,"desc":"Angkut sampah, sapu sisa acara"},
    {"code":"kaca_dalam","label":"Partisi kaca / sekat","ratePerM2":4500,"desc":"Lap partisi kaca kantor, ruang meeting"}
  ]'::jsonb,
  'pricing', 'Daftar item skala besar (mall/pabrik/dll) + rate per m2.'),

('pricing.large_scale.bathroom_rate', '75000', 'pricing', 'Bersih kamar mandi skala besar (Rp/unit).'),
('pricing.large_scale.max_m2', '500', 'pricing', 'Max luas skala besar tanpa survey.'),

-- ====== DIRT LEVELS (Tingkat Kekotoran) ======
('pricing.dirt_levels',
  '[
    {"level":1,"label":"Ringan","desc":"Debu & kotoran harian","multiplier":1.0},
    {"level":2,"label":"Sedang","desc":"Belum dibersihkan beberapa hari","multiplier":1.15},
    {"level":3,"label":"Sangat Kotor","desc":"Lama tidak dibersihkan / pasca renovasi · foto wajib","multiplier":1.4}
  ]'::jsonb,
  'pricing', '3 level kotor dengan multiplier harga (1.0/1.15/1.4).')

ON CONFLICT (key) DO NOTHING;
