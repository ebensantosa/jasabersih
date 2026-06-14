-- Hapus duplicate user_devices entries (same user + same fcm_token = 1 row)
DELETE FROM user_devices a
 USING user_devices b
 WHERE a.id < b.id
   AND a.user_id = b.user_id
   AND a.fcm_token = b.fcm_token;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_device_token
  ON user_devices(user_id, fcm_token)
  WHERE fcm_token IS NOT NULL;
