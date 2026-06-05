-- =====================================================================
-- Flip Withdrawal Infrastructure
-- - cleaner_bank_accounts: verified bank accounts (via Flip Inquiry API)
-- - withdrawals: extended for Flip Disbursement integration
-- - app_config defaults: withdrawal rules
-- =====================================================================

-- Cleaner verified bank accounts
CREATE TABLE IF NOT EXISTS cleaner_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_code VARCHAR(20) NOT NULL,           -- e.g. "bca","mandiri","bri","bni","cimb","permata","bsi","danamon"
  account_number VARCHAR(50) NOT NULL,
  account_holder_name VARCHAR(255) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  flip_inquiry_id VARCHAR(100),             -- Flip inquiry request id, null if not yet inquired
  inquiry_result JSONB,                     -- full Flip response (for audit)
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, bank_code, account_number)
);
CREATE INDEX IF NOT EXISTS idx_cleaner_bank_user ON cleaner_bank_accounts(user_id, is_default DESC);

-- Extend withdrawals for Flip
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES cleaner_bank_accounts(id);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS flip_disbursement_id VARCHAR(100);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS flip_idempotency_key VARCHAR(100) UNIQUE;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS callback_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_withdrawals_flip_id ON withdrawals(flip_disbursement_id);

-- Default app_config keys for withdrawal rules (only set if not yet present).
INSERT INTO app_config (key, value, description, category, updated_at) VALUES
  ('withdrawal.min_amount',             '50000'::jsonb,           'Min withdrawal amount (Rp)', 'payment', NOW()),
  ('withdrawal.max_daily',              '2000000'::jsonb,         'Max total withdrawal per cleaner per day (Rp)', 'payment', NOW()),
  ('withdrawal.cooldown_hours',         '4'::jsonb,               'Cooldown jam antar withdrawal request', 'payment', NOW()),
  ('withdrawal.auto_approve_threshold', '500000'::jsonb,          'Auto-disburse jika amount <= threshold; di atasnya hold buat admin approve', 'payment', NOW()),
  ('withdrawal.fee_payer',              '"owner"'::jsonb,         'Siapa bayar fee Flip: "owner" atau "cleaner"', 'payment', NOW()),
  ('withdrawal.settlement_hours',       '24'::jsonb,              'Berapa jam setelah booking completed sebelum saldo settle (kalau customer gak confirm)', 'payment', NOW())
ON CONFLICT (key) DO NOTHING;
