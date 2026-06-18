-- Tambah action: cleaner bisa request 'add' atau 'remove' area.
-- Default 'add' untuk row existing.
ALTER TABLE cleaner_area_requests
  ADD COLUMN IF NOT EXISTS action VARCHAR(10) NOT NULL DEFAULT 'add';

-- Drop unique index lama (cleaner+city pending) dan replace dgn versi yg
-- include action, supaya cleaner bisa submit "add Bali" dan "remove Pati"
-- bersamaan tanpa conflict.
DROP INDEX IF EXISTS uq_cleaner_area_pending;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cleaner_area_pending
  ON cleaner_area_requests(cleaner_id, lower(trim(city)), action)
  WHERE status = 'pending';
