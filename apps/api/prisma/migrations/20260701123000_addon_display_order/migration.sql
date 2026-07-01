ALTER TABLE add_ons
  ADD COLUMN IF NOT EXISTS input_type VARCHAR(10) NOT NULL DEFAULT 'qty';

ALTER TABLE add_ons
  ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY price ASC, name ASC, id ASC) AS rn
  FROM add_ons
)
UPDATE add_ons a
SET display_order = ordered.rn
FROM ordered
WHERE a.id = ordered.id
  AND (a.display_order IS NULL OR a.display_order = 0);
