-- Tandai service mana yang masuk seksi "Paket Lengkap" di mobile home.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: service yang sebelumnya hardcoded sebagai bundle di mobile.
UPDATE services SET is_bundle = TRUE
 WHERE code IN ('full_house', 'kantor', 'pasca_renovasi', 'subscription', 'paket_bundle');
