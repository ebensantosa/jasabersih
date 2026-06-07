-- Pastikan max_addresses = 5 (sesuai mobile UI gate)
INSERT INTO app_config (key, value, category, description)
VALUES ('feature.max_addresses', '5'::jsonb, 'feature', 'Maksimal alamat tersimpan per user.')
ON CONFLICT (key) DO UPDATE SET value = '5'::jsonb;

SELECT key, value FROM app_config WHERE key = 'feature.max_addresses';
