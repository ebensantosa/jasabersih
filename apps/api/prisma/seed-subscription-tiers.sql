-- Tiered subscription packages: harga tetap (justifikasi sama pricing standalone),
-- scope makin lengkap di tier atas. Idempotent: pakai UPDATE.
-- Jalanin: psql "$DATABASE_URL" -f seed-subscription-tiers.sql

-- BASIC 3x — 450k (150k/visit) — essentials
UPDATE pricing_packages
   SET price = 450000,
       duration_min = 120,
       scope = '{
         "note": "Berlangganan bulanan - 3x. Cocok untuk rumah kecil / kost yang ingin bersih rutin tanpa repot.",
         "includes": [
           "3x kunjungan per bulan",
           "Durasi maks 2 jam per kunjungan",
           "Area: 1 kamar tidur + 1 kamar mandi, atau 2 kamar tidur (tanpa KM)",
           "Sapu, pel & lap debu permukaan",
           "Lap kaca/cermin ringan",
           "Buang sampah & ganti kantong",
           "Bersih toilet standar (lap permukaan + sikat ringan)",
           "Rapikan barang di permukaan meja"
         ]
       }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='subscription')
   AND name ILIKE '%Basic%';

-- STANDARD 5x — 750k (150k/visit) — Basic + deep touch
UPDATE pricing_packages
   SET price = 750000,
       duration_min = 135,
       scope = '{
         "note": "Berlangganan bulanan - 5x. Cocok untuk rumah sibuk / kost medium yang ingin lebih stabil kebersihannya.",
         "includes": [
           "5x kunjungan per bulan",
           "Durasi maks 2-2.5 jam per kunjungan",
           "Area: 2 kamar tidur + 1 kamar mandi, atau 3 kamar tidur",
           "Semua scope Basic +",
           "Lap perabotan, rak & meja kerja",
           "Bersih dapur dasar (kompor, sink, meja dapur)",
           "Rapikan kabel, remote & barang random",
           "Pengharum ruangan setelah selesai",
           "Bisa request prioritas area (kamar tidur / ruang tamu)",
           "Cleaner sama 80% kunjungan (lebih kenal preferensi)"
         ]
       }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='subscription')
   AND name ILIKE '%Standard%';

-- PREMIUM 6x — 1.2jt (200k/visit) — Standard + premium services
UPDATE pricing_packages
   SET price = 1200000,
       duration_min = 180,
       scope = '{
         "note": "Berlangganan bulanan - 6x. Cocok untuk hotel kecil / villa / owner banyak kamar. Lebih siap untuk pergantian tamu.",
         "includes": [
           "6x kunjungan per bulan",
           "Durasi maks 3 jam per kunjungan",
           "Area: 3 kamar tidur + 2 kamar mandi, atau 4 kamar tidur + 1 kamar mandi",
           "Semua scope Standard +",
           "Cuci piring kalau ada (max 1 sink penuh)",
           "Lipat baju di lemari (kalau sudah dijemur kering)",
           "Ganti sprei & sarung bantal (linen disediakan customer)",
           "Vacuum kasur & sofa 1x per bulan",
           "Lap kaca jendela menyeluruh (dalam + luar yang reachable)",
           "Bersih kulkas luar + microwave + dispenser",
           "Deep clean toilet (kerak ringan, jamur sela nat)",
           "Laporan foto before/after di app",
           "Cleaner sama 100% kunjungan (cleaner tetap)",
           "Prioritas slot jadwal turnover (cocok rental harian)"
         ]
       }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='subscription')
   AND name ILIKE '%Premium%';

-- ULTIMATE 10x — 1.85jt (185k/visit) — Premium + full concierge
UPDATE pricing_packages
   SET price = 1850000,
       duration_min = 180,
       scope = '{
         "note": "Berlangganan bulanan - 10x. Untuk rumah besar / owner properti yang butuh maintenance harian. Frekuensi lebih dari 10x hubungi WA admin.",
         "includes": [
           "10x kunjungan per bulan (hampir setiap hari kerja)",
           "Durasi maks 3 jam per kunjungan",
           "Area: 4 kamar tidur + 2 kamar mandi, atau 5 kamar tidur + 1 kamar mandi",
           "Semua scope Premium +",
           "Setrika baju 1-2 set per visit",
           "Siram tanaman dalam rumah",
           "Cleaner prioritas (slot tetap, gak ganti-ganti orang)",
           "Vacuum kasur & sofa per minggu (4x per bulan)",
           "Bersih kulkas dalam 1x per bulan (max 30 menit, isi customer)",
           "Steam cuci karpet ruang tamu 1x per bulan",
           "Bersih AC outdoor (lap unit + filter) 1x per bulan",
           "Beli kebutuhan harian dalam radius 2 km (kalau request, max 30 menit)",
           "Laporan bulanan ringkas via WhatsApp",
           "Direct line cleaner via app (gak perlu lewat CS)",
           "Bisa reschedule h-1 tanpa charge (Basic/Standard h-2)"
         ]
       }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='subscription')
   AND (name ILIKE '%Ultimate%' OR name ILIKE '%10x%');
