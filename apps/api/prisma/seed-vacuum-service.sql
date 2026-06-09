-- Reactivate standalone Vacuum service + set deskripsi & includes per request user.
-- Run sekali di server: psql $DATABASE_URL -f seed-vacuum-service.sql

-- 1. Reactivate service & set description
UPDATE services
   SET is_active   = TRUE,
       show_on_home = TRUE,
       is_bundle   = FALSE,
       name        = 'Paket Vacuum',
       description = 'Cocok untuk yang ingin lantai lebih bersih dari debu & rambut. Area luas bisa menyesuaikan.'
 WHERE code = 'vacuum_lantai';

-- 2. Reactivate package + set scope
UPDATE pricing_packages
   SET is_active    = TRUE,
       price        = 120000,
       duration_min = 90,
       name         = 'Paket Vacuum',
       scope        = '{
         "note": "Cocok untuk yang ingin lantai lebih bersih dari debu & rambut. Area luas bisa menyesuaikan.",
         "includes": [
           "Vacuum lantai (debu, rambut, remah)",
           "Vacuum area sudut & pinggir dinding",
           "Finishing rapi"
         ]
       }'::jsonb
 WHERE service_id = (SELECT id FROM services WHERE code = 'vacuum_lantai');

-- 3. Kalau belum ada package (somehow), insert fresh
INSERT INTO pricing_packages (service_id, name, price, duration_min, scope, is_active)
SELECT s.id, 'Paket Vacuum', 120000, 90,
       '{
         "note": "Cocok untuk yang ingin lantai lebih bersih dari debu & rambut. Area luas bisa menyesuaikan.",
         "includes": [
           "Vacuum lantai (debu, rambut, remah)",
           "Vacuum area sudut & pinggir dinding",
           "Finishing rapi"
         ]
       }'::jsonb,
       TRUE
  FROM services s
 WHERE s.code = 'vacuum_lantai'
   AND NOT EXISTS (SELECT 1 FROM pricing_packages WHERE service_id = s.id);
