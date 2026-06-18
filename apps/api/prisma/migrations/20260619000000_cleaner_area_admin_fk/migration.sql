-- Fix: reviewed_by_admin_id awalnya FK ke users(id) - tapi admin ada di table
-- admin_users (terpisah). Drop FK + repoint ke admin_users supaya tetap ada
-- referential integrity.
ALTER TABLE cleaner_area_requests
  DROP CONSTRAINT IF EXISTS cleaner_area_requests_reviewed_by_admin_id_fkey;

ALTER TABLE cleaner_area_requests
  ADD CONSTRAINT cleaner_area_requests_reviewed_by_admin_id_fkey
  FOREIGN KEY (reviewed_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL;

-- Apply same fix ke city_requests yg sebelumnya juga punya kolom reviewed_by_admin_id
-- pointing ke users.
ALTER TABLE city_requests
  DROP CONSTRAINT IF EXISTS city_requests_reviewed_by_admin_id_fkey;

ALTER TABLE city_requests
  ADD CONSTRAINT city_requests_reviewed_by_admin_id_fkey
  FOREIGN KEY (reviewed_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL;
