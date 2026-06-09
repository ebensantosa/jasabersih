-- Reactivate Subscription / Berlangganan Bulanan service + packages.
-- Jalanin di server: psql "$DATABASE_URL" -f seed-subscription-service.sql

UPDATE services
   SET is_active   = TRUE,
       show_on_home = TRUE,
       is_bundle   = TRUE,
       name        = 'Berlangganan Bulanan',
       description = 'Paket berkala 3-6x kunjungan/bulan dengan harga lebih hemat.'
 WHERE code = 'subscription';

-- Aktifkan semua package subscription
UPDATE pricing_packages
   SET is_active = TRUE
 WHERE service_id = (SELECT id FROM services WHERE code = 'subscription');

-- Kalau ada package yang missing scope, set default scope (idempotent — UPDATE WHERE scope is null)
UPDATE pricing_packages
   SET scope = '{"includes":["3x kunjungan per bulan","Maks ±2 jam per kunjungan","Area: 1 kamar + 1 kamar mandi"],"note":"Berlangganan bulanan - 3x"}'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='subscription')
   AND name ILIKE '%Basic%'
   AND (scope IS NULL OR scope = 'null'::jsonb);

UPDATE pricing_packages
   SET scope = '{"includes":["5x kunjungan per bulan","Maks ±2-2.5 jam per kunjungan","Area: 2 kamar + 1 kamar mandi"],"note":"Berlangganan bulanan - 5x"}'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='subscription')
   AND name ILIKE '%Standard%'
   AND (scope IS NULL OR scope = 'null'::jsonb);

UPDATE pricing_packages
   SET scope = '{"includes":["6x kunjungan per bulan","Maks ±3 jam per kunjungan","Area: 3 kamar + 2 KM"],"note":"Berlangganan bulanan - 6x"}'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code='subscription')
   AND name ILIKE '%Premium%'
   AND (scope IS NULL OR scope = 'null'::jsonb);
