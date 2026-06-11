-- Anti-fraud + anti-duplicate constraints.

-- 1. Tip 1x per booking per customer — cegah double-tap submit
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tip_per_booking
  ON wallet_ledger_entries (user_id, reference_id)
  WHERE reference_type = 'tip' AND account_type = 'credit_use';

-- 2. Withdrawal idempotency — cegah duplicate withdrawal via race
CREATE UNIQUE INDEX IF NOT EXISTS uniq_withdrawal_idempotency
  ON withdrawals (user_id, flip_idempotency_key)
  WHERE flip_idempotency_key IS NOT NULL;

-- 3. Voucher usage per phone per voucher — cegah race condition pakai berulang
CREATE UNIQUE INDEX IF NOT EXISTS uniq_voucher_usage_per_phone
  ON voucher_usage_log (voucher_code, phone);

-- 4. Self-referral / dual-redeem — referred_id cuma boleh dapet 1 referral
CREATE UNIQUE INDEX IF NOT EXISTS uniq_referral_per_referred
  ON referrals (referred_id);
