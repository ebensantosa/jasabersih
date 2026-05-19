-- Re-clean flow: customer minta cleaner balik benerin sebelum dispute formal.
-- Limit 1x per booking, hanya dalam 24 jam setelah completed.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reclean_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reclean_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reclean_reason TEXT,
  ADD COLUMN IF NOT EXISTS reclean_status TEXT; -- requested | accepted | rejected | done | null
