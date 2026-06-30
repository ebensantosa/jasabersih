-- Add input_type column to add_ons: 'qty' (default) or 'checkbox'
ALTER TABLE add_ons ADD COLUMN IF NOT EXISTS input_type VARCHAR(10) NOT NULL DEFAULT 'qty';

-- Backfill existing checkbox-style addons
UPDATE add_ons SET input_type = 'checkbox'
 WHERE code IN (
   'cuci_piring','cuci_alat_masak',
   'kulkas','kompor','microwave_oven','hood_exhaust','dispenser',
   'bathtub_general','bathtub_deep',
   'sampah','decluttering'
 );

-- Hapus AC cleaning jika ada
UPDATE add_ons SET is_active = FALSE WHERE name ILIKE '%cuci%AC%' OR name ILIKE '%bersih%AC%' OR code ILIKE '%cuci_ac%' OR code ILIKE '%ac_%';

-- Verify
SELECT code, name, input_type FROM add_ons WHERE is_active = TRUE ORDER BY input_type, name;
