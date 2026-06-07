-- ============================================================
-- Simplify dirt levels: 5 → 3 (Ringan, Sedang, Sangat Kotor)
-- Update default multipliers per package + global config
-- ============================================================

BEGIN;

-- Update package-level dirt_multipliers (default jadi 3-tier)
UPDATE pricing_packages
   SET dirt_multipliers = '{"2": 1.15, "3": 1.4}'::jsonb
 WHERE is_active = true;

-- Update / insert app_config global multipliers
INSERT INTO app_config (key, value, category, description)
VALUES (
  'pricing.dirt_multipliers',
  '{"2": 1.15, "3": 1.4}'::jsonb,
  'pricing',
  'Multiplier harga per tingkat kotor. Level 1 = normal (×1), level 2 = ×1.15, level 3 = ×1.4.'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

COMMIT;

SELECT key, value FROM app_config WHERE key = 'pricing.dirt_multipliers';
