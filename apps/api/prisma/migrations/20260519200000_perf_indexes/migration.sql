-- Composite indexes untuk hot query paths. Pakai IF NOT EXISTS biar idempotent.

-- Notifications dedup: WHERE user_id AND type AND data->>bookingId AND created_at > NOW()-1h
CREATE INDEX IF NOT EXISTS notifications_user_type_created_idx
  ON notifications (user_id, type, created_at DESC);

-- Disputes: cron wallet-clear cek "ada dispute aktif gak untuk booking ini"
CREATE INDEX IF NOT EXISTS disputes_booking_status_idx
  ON disputes (booking_id, status);

-- Disputes: list per user (raised_by) — dispute history
CREATE INDEX IF NOT EXISTS disputes_raised_by_created_idx
  ON disputes (raised_by, created_at DESC);

-- Wallet ledger: cron clear matured (status='PENDING' AND account_type='earnings' AND created_at < cutoff)
CREATE INDEX IF NOT EXISTS wallet_ledger_pending_earnings_idx
  ON wallet_ledger_entries (status, account_type, created_at)
  WHERE status = 'PENDING';

-- Wallet ledger: list balance per user
CREATE INDEX IF NOT EXISTS wallet_ledger_user_status_idx
  ON wallet_ledger_entries (user_id, status, created_at DESC);

-- Bookings: customer's active list (hot query saat masuk app)
CREATE INDEX IF NOT EXISTS bookings_customer_status_idx
  ON bookings (customer_id, status, created_at DESC);

-- Bookings: cleaner's active jobs
CREATE INDEX IF NOT EXISTS bookings_cleaner_status_idx
  ON bookings (cleaner_id, status, scheduled_at ASC)
  WHERE cleaner_id IS NOT NULL;

-- Chat: rate limit count + load history per booking
CREATE INDEX IF NOT EXISTS chat_messages_booking_sender_created_idx
  ON chat_messages (booking_id, sender_id, created_at DESC);

-- Ratings: aggregate ratee_id (recompute average) + booking unique lookup
CREATE INDEX IF NOT EXISTS ratings_ratee_idx
  ON ratings (ratee_id);

-- User sessions: cleanup expired
CREATE INDEX IF NOT EXISTS user_sessions_user_expires_idx
  ON user_sessions (user_id, expires_at);

-- OTP: cleanup + lookup latest
CREATE INDEX IF NOT EXISTS otp_codes_phone_created_idx
  ON otp_codes (phone, created_at DESC);

-- Voucher usage log: phone-level check (lookup hot dalam booking create)
-- (sudah dibuat di migration sebelumnya, tapi tambah composite untuk safety)
CREATE INDEX IF NOT EXISTS voucher_usage_log_phone_code_idx2
  ON voucher_usage_log (phone, voucher_code, used_at DESC);
