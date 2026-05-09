-- Dedupe pricing_packages: kalau ada beberapa baris dengan nama sama di service yg sama,
-- keep yang paling lama (created_at terlama), soft-disable sisanya.
-- Ini fix duplicate "Kamar Standard" × 7 yang muncul di mobile.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY service_id, lower(trim(name))
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM pricing_packages
   WHERE is_active = TRUE
)
UPDATE pricing_packages
   SET is_active = FALSE
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Pastikan paket lama legacy yang tidak ada di canonical pricelist juga di-disable
UPDATE pricing_packages
   SET is_active = FALSE
 WHERE name IN (
   'Kamar Standard', 'Hemat - Kamar Tidur', 'Kombo - Kamar + KM',
   'Toilet', 'Ruang Tamu', 'Dapur', 'Vacuum Seluruh Area', 'Pekarangan',
   'Garasi/Teras', 'Kombo - Kamar + KM Dalam'
 );
