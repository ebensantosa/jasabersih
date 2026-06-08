-- Disable max active bookings limit (0 = no limit)
INSERT INTO app_config (key, value, category, description)
VALUES ('abuse.max_active_bookings', '0'::jsonb, 'abuse', 'Max booking aktif simultan per customer. 0 = no limit.')
ON CONFLICT (key) DO UPDATE SET value = '0'::jsonb, description = EXCLUDED.description;

SELECT key, value FROM app_config WHERE key = 'abuse.max_active_bookings';
