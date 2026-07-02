-- Seed: default feature flags
-- Run once on VPS: psql $DATABASE_URL -f seed-feature-flags.sql

INSERT INTO app_config (key, value, description, category)
VALUES ('feature.call_enabled', 'true', 'Tampilkan tombol telepon di chat antara customer dan cleaner', 'feature')
ON CONFLICT (key) DO NOTHING;
