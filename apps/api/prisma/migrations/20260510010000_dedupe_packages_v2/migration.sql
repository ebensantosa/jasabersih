-- Re-dedupe + cleanup hard-delete duplicates dari seed legacy yang spam multiple deploys.
-- Strategy: hard DELETE rows yang ke-mark inactive duplicate (yg masih bisa dihapus tanpa FK).
-- Untuk yang sudah ke-reference dari bookings, biarin (history audit).

-- Step 1: hard-delete legacy duplicate names yang gak punya booking reference
DELETE FROM pricing_packages
 WHERE name IN ('Kamar Standard', 'Dapur Standard', 'Full House Tipe 36', 'Full House Tipe 45')
   AND id NOT IN (SELECT DISTINCT package_id FROM bookings WHERE package_id IS NOT NULL);

-- Step 2: untuk yang masih ada (karena ke-reference booking), soft-disable
UPDATE pricing_packages SET is_active = FALSE
 WHERE name IN ('Kamar Standard', 'Dapur Standard', 'Full House Tipe 36', 'Full House Tipe 45');

-- Step 3: re-dedupe per (service_id, name) — keep first (oldest by id), soft-disable rest
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY service_id, lower(trim(name))
           ORDER BY id ASC
         ) AS rn
    FROM pricing_packages
   WHERE is_active = TRUE
)
UPDATE pricing_packages SET is_active = FALSE
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
