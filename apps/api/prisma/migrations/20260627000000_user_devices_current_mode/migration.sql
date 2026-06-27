ALTER TABLE user_devices
  ADD COLUMN IF NOT EXISTS current_mode VARCHAR(20) DEFAULT NULL;

-- Partial index already exists from 20260614 migration but let's make sure
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_device_token
  ON user_devices(user_id, fcm_token)
  WHERE fcm_token IS NOT NULL;
