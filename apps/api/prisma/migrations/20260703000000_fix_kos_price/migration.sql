-- Fix: kos package price was 0 (not set properly when service was moved).
-- Set to 200_000 flat (same as pindah_kos, same type of service).
-- Also ensure kos service is active (seed-bundle-cleanup.sql may have deactivated it).

UPDATE pricing_packages
   SET price = 200000,
       duration_min = 180,
       is_active = true
 WHERE service_id = (SELECT id FROM services WHERE code = 'kos' LIMIT 1)
   AND (price = 0 OR price IS NULL);

-- Re-activate kos service if it exists and was deactivated but is still needed
UPDATE services
   SET is_active = true
 WHERE code = 'kos'
   AND is_active = false
   AND EXISTS (
     SELECT 1 FROM pricing_packages pp WHERE pp.service_id = services.id AND pp.is_active = true
   );
