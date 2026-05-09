-- Align pricing dengan jasabersih.com canonical pricelist
-- Includes: general cleaning paket, paket khusus, subscription bulanan, deep cleaning category

-- 1. Tambah service categories proper: General Cleaning, Deep Cleaning, Subscription
-- Note: deep_cleaning bukan service terpisah, tapi modifier (×1.5) di atas general_cleaning
INSERT INTO services (code, name, description, is_active, display_order) VALUES
  ('general_cleaning', 'General Cleaning', 'Pembersihan rutin: sapu, pel, lap permukaan, rapikan barang. Untuk kondisi kotor ringan-sedang. Bisa upgrade ke Deep Cleaning saat booking.', TRUE, 1),
  ('subscription',     'Berlangganan Bulanan', 'Paket berkala 3-6x kunjungan/bulan dengan harga lebih hemat.', TRUE, 2),
  ('konsultasi',       'Konsultasi Khusus', 'Pembersihan area/alat khusus, harga & waktu menyesuaikan via WA Survey.', TRUE, 3)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Disable deep_cleaning service kalau sebelumnya pernah ke-create (legacy)
UPDATE services SET is_active = FALSE WHERE code = 'deep_cleaning';

-- 2. Hapus paket lama yang harga/scope beda jauh (avoid duplicate confusion)
-- Ini soft-disable saja, jangan delete (ada FK booking history)
UPDATE pricing_packages
   SET is_active = FALSE
 WHERE name IN ('Hemat – Kamar Tidur','Kombo – Kamar + KM','Toilet','Ruang Tamu','Dapur','Vacuum Seluruh Area','Pekarangan','Garasi/Teras','Kamar Standard');

-- 3. Insert canonical packages — General Cleaning service
INSERT INTO pricing_packages (service_id, name, price, duration_min, scope, is_active)
SELECT s.id, p.name, p.price::bigint, p.duration_min::int, p.scope::jsonb, TRUE
FROM (VALUES
  ('Paket Hemat – Kamar Tidur', 120000, 90, '{"includes":["Plafon & sarang laba-laba","Bersihkan bawah tempat tidur","Jendela, kaca, cermin","Lap luar meja, lemari, rak","Rapikan barang berantakan","Sapu & pel lantai + pengharum ruangan"],"note":"Untuk kondisi kotor ringan-sedang"}'),
  ('Paket Kombo – Kamar + KM Dalam', 160000, 120, '{"includes":["Semua item Paket Hemat (kamar tidur)","Sikat ring toilet & keramik kamar mandi","Lap jendela, kaca, cermin","Lap wastafel & countertop","Rapikan perlengkapan mandi + pengharum"]}'),
  ('Paket Toilet (Kecil)', 90000, 60, '{"includes":["Plafon & sarang laba-laba","Sikat ring toilet & keramik","Jendela, kaca, cermin","Wastafel & countertop","Rapikan perlengkapan mandi + pengharum"],"note":"Untuk toilet kecil / kotor ringan"}'),
  ('Paket Toilet (Besar)', 120000, 75, '{"includes":["Plafon & sarang laba-laba","Sikat ring toilet & keramik","Jendela, kaca, cermin","Wastafel & countertop","Rapikan perlengkapan mandi + pengharum"],"note":"Untuk toilet besar / kotor sedang"}'),
  ('Paket Ruang Tamu', 150000, 90, '{"includes":["Plafon & sarang laba-laba","Jendela, kaca, cermin","Meja, rak, kursi","Rapikan dekorasi & buku","Sapu & pel + pengharum"]}'),
  ('Paket Vacuum', 120000, 75, '{"includes":["Vacuum lantai (debu, rambut, remah)","Vacuum area sudut & pinggir dinding","Finishing rapi"]}'),
  ('Paket Dapur', 160000, 120, '{"includes":["Plafon & sarang laba-laba","Lap countertop & kabinet","Cuci sink & peralatan dasar","Rapikan peralatan masak","Sapu & pel + pengharum"]}'),
  ('Paket Pekarangan Rumah', 150000, 105, '{"includes":["Sapu daun kering, sampah & debu","Sirami tanaman (bila perlu)","Rapikan perabot luar","Pengharum udara luar"]}'),
  ('Paket Garasi/Teras', 130000, 90, '{"includes":["Sapu daun, debu, kotoran","Bersihkan perabot luar","Bersihkan dinding luar (noda ringan)"]}'),
  ('Paket Pindah Kost / Kosongan', 200000, 180, '{"includes":["Sapu & pel menyeluruh","Lap meja/lemari/rak bagian luar","Kaca/cermin (jika ada)","Kamar mandi ringan (jika termasuk)"],"note":"Harga MULAI 200K, menyesuaikan ukuran & tingkat kotor"}')
) AS p(name, price, duration_min, scope)
CROSS JOIN (SELECT id FROM services WHERE code = 'general_cleaning' LIMIT 1) s
WHERE NOT EXISTS (SELECT 1 FROM pricing_packages pp WHERE pp.service_id = s.id AND pp.name = p.name);

-- 4. Subscription packages — service 'subscription'
INSERT INTO pricing_packages (service_id, name, price, duration_min, scope, is_active)
SELECT s.id, p.name, p.price::bigint, p.duration_min::int, p.scope::jsonb, TRUE
FROM (VALUES
  ('Paket Basic — 3x/bulan', 450000, 120, '{"includes":["3x kunjungan per bulan","Maks ±2 jam per kunjungan","Area: 1 kamar + 1 kamar mandi, atau 2 kamar tanpa KM","Sapu-pel, lap debu permukaan","Lap kaca/cermin ringan, buang sampah","Toilet standar"],"note":"Berlangganan bulanan — visit 3x"}'),
  ('Paket Standard — 5x/bulan', 750000, 135, '{"includes":["5x kunjungan per bulan","Maks ±2-2.5 jam per kunjungan","Area: 2 kamar + 1 kamar mandi, atau 3 kamar tanpa KM","Sapu-pel, lap permukaan","Kaca/cermin ringan, buang sampah","Toilet standar"],"note":"Berlangganan bulanan — visit 5x"}'),
  ('Paket Premium — 6x/bulan', 1200000, 180, '{"includes":["6x kunjungan per bulan","Maks ±3 jam per kunjungan","Area: 3 kamar + 2 KM, atau 4 kamar + 1 KM","Bisa fokus kamar + kamar mandi sesuai kebutuhan","Lap permukaan + kaca/cermin","Toilet standar"],"note":"Berlangganan bulanan — visit 6x"}')
) AS p(name, price, duration_min, scope)
CROSS JOIN (SELECT id FROM services WHERE code = 'subscription' LIMIT 1) s
WHERE NOT EXISTS (SELECT 1 FROM pricing_packages pp WHERE pp.service_id = s.id AND pp.name = p.name);

-- 5. App config: catatan biaya tambahan (untuk display di mobile)
INSERT INTO app_config (key, value, category, description) VALUES
  ('pricing.disclaimer',
   '"Harga berlaku untuk kondisi kotor ringan-sedang. Kerak tebal / jamur / nat hitam / bekas renovasi = biaya tambahan. Angkut sampah besar & pindah barang berat = biaya tambahan. Lokasi di luar area Jogja = biaya transport menyesuaikan jarak."',
   'feature',
   'Disclaimer harga — tampil di booking form & paket detail'),
  ('pricing.deep_clean_multiplier',
   '1.45',
   'feature',
   'Multiplier biaya untuk deep cleaning vs general cleaning (1.45 = +45%, hasil dibulatkan ke atas per 1000)')
ON CONFLICT (key) DO NOTHING;
