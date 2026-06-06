-- ============================================================
-- Update package scope dengan detail pekerjaan per layanan
-- Format: {"note": "deskripsi", "includes": ["item1", "item2", ...]}
-- Source: jasabersih.com/cleaning-service-jogja/
-- ============================================================

BEGIN;

-- Kamar Tidur
UPDATE pricing_packages
   SET scope = '{
     "note": "Cocok untuk kamar kotor ringan–sedang. Jika ada kerak tebal/jamur biasanya perlu biaya tambahan.",
     "includes": [
       "Plafon & sarang laba-laba",
       "Bersihkan bawah tempat tidur (jika bisa)",
       "Jendela, kaca, cermin",
       "Lap luar meja, lemari, rak",
       "Rapikan barang berantakan",
       "Sapu & pel lantai",
       "Pengharum ruangan"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='kamar')
   AND is_active = true;

-- Kamar + Toilet (Kombo)
UPDATE pricing_packages
   SET scope = '{
     "note": "Bersih kamar tidur lengkap + kamar mandi dalam. Cocok untuk pemeliharaan rutin.",
     "includes": [
       "Plafon & sarang laba-laba",
       "Bersihkan bawah tempat tidur (jika bisa)",
       "Jendela, kaca, cermin",
       "Lap luar meja, lemari, rak",
       "Rapikan barang berantakan",
       "Sapu & pel lantai kamar",
       "Sikat lantai & dinding kamar mandi",
       "Bersih kloset, wastafel, kaca cermin",
       "Pengharum ruangan"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='kamar_km_dalam')
   AND is_active = true;

-- Toilet / Kamar Mandi
UPDATE pricing_packages
   SET scope = '{
     "note": "Pembersihan kamar mandi standar. Untuk kerak tebal/lumut berat mungkin perlu deep cleaning.",
     "includes": [
       "Sikat dinding & lantai keramik",
       "Bersih kloset (luar & dalam)",
       "Bersih wastafel & keran",
       "Poles cermin & kaca shower",
       "Bersih saluran air permukaan",
       "Bersih shower head",
       "Pengharum kamar mandi"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='kamar_mandi')
   AND is_active = true;

-- Dapur
UPDATE pricing_packages
   SET scope = '{
     "note": "Bersih dapur menyeluruh. Tidak termasuk cuci peralatan masak / kulkas (add-on terpisah).",
     "includes": [
       "Plafon & sarang laba-laba",
       "Lap luar lemari dapur & rak",
       "Bersih meja kerja / countertop",
       "Lap luar kompor (tanpa grill detail)",
       "Sapu & pel lantai dapur",
       "Bersih wastafel cuci piring",
       "Buang sampah dapur",
       "Pengharum ruangan"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='dapur')
   AND is_active = true;

-- Ruang Tamu
UPDATE pricing_packages
   SET scope = '{
     "note": "Bersih area ruang tamu / keluarga. Cuci sofa basah / vacuum dalam = add-on terpisah.",
     "includes": [
       "Plafon & sarang laba-laba",
       "Jendela, kaca, cermin",
       "Lap permukaan sofa & meja",
       "Lap rak TV & elektronik luar",
       "Rapikan bantal, remote, majalah",
       "Sapu & pel lantai",
       "Bersih kolong sofa (jika bisa)",
       "Pengharum ruangan"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='ruang_tamu')
   AND is_active = true;

-- Pindah Kost
UPDATE pricing_packages
   SET scope = '{
     "note": "Pembersihan menyeluruh kamar kos kosongan untuk serah-terima. Bukti foto setelah selesai.",
     "includes": [
       "Plafon & sudut ruangan",
       "Lap dinding & sudut",
       "Bersih lemari dalam & luar",
       "Bersih kamar mandi total",
       "Bersih meja & rak",
       "Sapu, pel & vacuum seluruh lantai",
       "Lap jendela, kaca, kusen",
       "Cek & rapikan stop kontak / saklar luar",
       "Pengharum ruangan"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='pindah_kos')
   AND is_active = true;

-- Vacuum (lantai)
UPDATE pricing_packages
   SET scope = '{
     "note": "Vacuum lantai seluruh area + spot mopping. Cocok untuk maintenance harian.",
     "includes": [
       "Vacuum debu & rambut di lantai",
       "Vacuum karpet (per m²)",
       "Spot mopping noda di lantai",
       "Lap baseboard / list dinding",
       "Rapikan barang di lantai",
       "Pengharum ruangan"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='vacuum_lantai')
   AND is_active = true;

-- Garasi / Teras
UPDATE pricing_packages
   SET scope = '{
     "note": "Bersih area garasi atau teras depan. Tidak termasuk cuci kendaraan.",
     "includes": [
       "Sapu & pel area garasi/teras",
       "Bersih dinding & pilar",
       "Bersih plafon & lampu luar",
       "Bersih saluran air permukaan",
       "Lap pintu garasi luar",
       "Rapikan barang berantakan",
       "Buang sampah area"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='garasi')
   AND is_active = true;

-- Pekarangan
UPDATE pricing_packages
   SET scope = '{
     "note": "Bersih halaman / pekarangan rumah. Tidak termasuk potong rumput / trim tanaman besar.",
     "includes": [
       "Sapu daun & sampah pekarangan",
       "Bersih jalan setapak / paving",
       "Bersih pot tanaman & rak luar",
       "Bersih dinding pagar luar",
       "Rapikan area outdoor",
       "Buang sampah ke TPS"
     ]
   }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='pekarangan')
   AND is_active = true;

COMMIT;

-- Verify
SELECT s.code, p.name, p.scope->'note' AS deskripsi, jsonb_array_length(p.scope->'includes') AS jumlah_includes
  FROM pricing_packages p
  JOIN services s ON s.id = p.service_id
 WHERE p.is_active = true
 ORDER BY s.display_order;
