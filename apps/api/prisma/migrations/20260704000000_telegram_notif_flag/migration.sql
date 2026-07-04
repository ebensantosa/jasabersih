INSERT INTO app_config (key, value, category, description)
VALUES ('feature.telegram_notif', 'true', 'feature', 'Aktifkan notifikasi Telegram ke grup admin saat order masuk')
ON CONFLICT (key) DO NOTHING;
