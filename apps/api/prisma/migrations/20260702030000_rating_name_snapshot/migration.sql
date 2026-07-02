ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS rater_name_snapshot TEXT;

ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS rater_phone_snapshot TEXT;
