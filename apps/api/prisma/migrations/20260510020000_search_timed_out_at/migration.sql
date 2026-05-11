-- Tambah kolom buat track booking yang search timeout (15min tanpa cleaner respons)
-- Status tetap 'searching' supaya admin bisa manual assign cleaner dari dashboard.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS search_timed_out_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_bookings_search_timed_out
  ON bookings(status, search_timed_out_at)
  WHERE status = 'searching' AND search_timed_out_at IS NOT NULL;
