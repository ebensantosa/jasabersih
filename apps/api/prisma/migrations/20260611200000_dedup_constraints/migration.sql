-- Anti-fraud + anti-duplicate constraints.
-- NOTE: wallet_ledger_entries is partitioned by created_at - PostgreSQL requires partition
-- column included in UNIQUE INDEX on partitioned table. Workaround: dedup table terpisah.

-- 1. Tip 1x per booking per customer
-- Pakai dedup table karena wallet_ledger_entries partitioned (PG limitation).
-- App-level INSERT ke tabel ini sebelum tip ledger entry biar atomik.
CREATE TABLE IF NOT EXISTS tip_dedup (
  customer_id UUID NOT NULL,
  booking_id  UUID NOT NULL,
  amount      BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_id, booking_id)
);

-- 2. Withdrawal idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uniq_withdrawal_idempotency
  ON withdrawals (user_id, flip_idempotency_key)
  WHERE flip_idempotency_key IS NOT NULL;

-- 3. Voucher usage per phone per voucher
CREATE UNIQUE INDEX IF NOT EXISTS uniq_voucher_usage_per_phone
  ON voucher_usage_log (voucher_code, phone);

-- 4. Self-referral / dual-redeem
CREATE UNIQUE INDEX IF NOT EXISTS uniq_referral_per_referred
  ON referrals (referred_id);
