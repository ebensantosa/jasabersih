-- Dedup table for cleaner earnings per booking.
-- wallet_ledger_entries is partitioned by created_at so ON CONFLICT DO NOTHING
-- cannot match on (booking_id, user_id) — it's silently a no-op.
-- App inserts here first inside $executeRaw; if rowcount=0, ledger insert is skipped.
CREATE TABLE IF NOT EXISTS booking_earning_dedup (
  booking_id  UUID NOT NULL,
  user_id     UUID NOT NULL,
  PRIMARY KEY (booking_id, user_id)
);

-- Dedup table for referral payouts per booking.
CREATE TABLE IF NOT EXISTS referral_payout_dedup (
  booking_id UUID PRIMARY KEY
);

-- One pending withdrawal per user at a time.
-- Catches race conditions where two simultaneous requests both pass the
-- COUNT(*) pre-check before either has committed.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_pending_withdrawal_per_user
  ON withdrawals (user_id)
  WHERE review_status = 'pending';
