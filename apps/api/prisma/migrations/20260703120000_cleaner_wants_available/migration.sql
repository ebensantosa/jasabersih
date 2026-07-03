ALTER TABLE cleaner_profiles
  ADD COLUMN IF NOT EXISTS wants_available BOOLEAN NOT NULL DEFAULT FALSE;

-- Sync existing: kalau is_available = true, anggap wants_available juga true
UPDATE cleaner_profiles SET wants_available = TRUE WHERE is_available = TRUE;
