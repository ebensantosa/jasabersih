-- Add unit_price and duration_min directly on services table
-- for flat-per-unit pricing model (replaces complex package surcharges)
ALTER TABLE services ADD COLUMN IF NOT EXISTS unit_price BIGINT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_min INTEGER;

-- Backfill unit_price from existing pricing_packages (first active package per service)
UPDATE services s
SET unit_price = pp.price,
    duration_min = pp.duration_min
FROM (
  SELECT DISTINCT ON (service_id)
    service_id, price, duration_min
  FROM pricing_packages
  WHERE is_active = true
  ORDER BY service_id, price ASC
) pp
WHERE s.id = pp.service_id
  AND s.unit_price IS NULL;
