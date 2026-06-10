-- Tambah paket Ultimate (10x kunjungan/bulan) ke service subscription.
-- Jalanin sekali: psql "$DATABASE_URL" -f seed-subscription-ultimate.sql

INSERT INTO pricing_packages (service_id, name, price, duration_min, scope, is_active)
SELECT s.id,
       'Paket Ultimate - 10x/bulan',
       1850000,
       180,
       '{
         "includes": [
           "10x kunjungan per bulan (hampir tiap hari kerja)",
           "Maks plus minus 3 jam per kunjungan",
           "Area: 4 kamar + 2 kamar mandi, atau 5 kamar + 1 kamar mandi",
           "Bisa fokus area sesuai prioritas hari itu",
           "Lap permukaan + kaca/cermin + buang sampah",
           "Toilet standar + dapur ringan",
           "Cocok untuk rumah besar/hotel kecil/kantor harian"
         ],
         "note": "Berlangganan bulanan - 10x. Untuk frekuensi lebih dari 10x, hubungi WA admin."
       }'::jsonb,
       TRUE
  FROM services s
 WHERE s.code = 'subscription'
   AND NOT EXISTS (
     SELECT 1 FROM pricing_packages p
      WHERE p.service_id = s.id
        AND (p.name ILIKE '%Ultimate%' OR p.name ILIKE '%10x%')
   );
