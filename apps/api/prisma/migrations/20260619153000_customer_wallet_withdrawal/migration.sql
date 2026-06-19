-- =====================================================================
-- Customer wallet withdrawal infrastructure
-- - customer_bank_accounts: verified payout destinations for customers
-- - withdrawals.customer_bank_account_id: link withdrawal -> customer account
-- =====================================================================

CREATE TABLE IF NOT EXISTS customer_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_code VARCHAR(20) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  account_holder_name VARCHAR(255) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  flip_inquiry_id VARCHAR(100),
  inquiry_result JSONB,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, bank_code, account_number)
);

CREATE INDEX IF NOT EXISTS idx_customer_bank_user ON customer_bank_accounts(user_id, is_default DESC);

ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS customer_bank_account_id UUID REFERENCES customer_bank_accounts(id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_customer_bank_account_id ON withdrawals(customer_bank_account_id);
