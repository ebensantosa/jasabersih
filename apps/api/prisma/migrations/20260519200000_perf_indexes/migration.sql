-- Composite indexes untuk hot query paths. Tiap statement dibungkus DO block
-- supaya 1 tabel hilang gak gagalkan seluruh migration.

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS notifications_user_type_created_idx
    ON notifications (user_id, type, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS disputes_booking_status_idx
    ON disputes (booking_id, status);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS disputes_raised_by_created_idx
    ON disputes (raised_by, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS wallet_ledger_pending_earnings_idx
    ON wallet_ledger_entries (status, account_type, created_at)
    WHERE status = 'PENDING';
EXCEPTION WHEN undefined_table OR feature_not_supported THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS wallet_ledger_user_status_idx
    ON wallet_ledger_entries (user_id, status, created_at DESC);
EXCEPTION WHEN undefined_table OR feature_not_supported THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS bookings_customer_status_idx
    ON bookings (customer_id, status, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS bookings_cleaner_status_idx
    ON bookings (cleaner_id, status, scheduled_at ASC)
    WHERE cleaner_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS chat_messages_booking_sender_created_idx
    ON chat_messages (booking_id, sender_id, created_at DESC);
EXCEPTION WHEN undefined_table OR feature_not_supported THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS ratings_ratee_idx
    ON ratings (ratee_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS user_sessions_user_expires_idx
    ON user_sessions (user_id, expires_at);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS voucher_usage_log_phone_code_idx2
    ON voucher_usage_log (phone, voucher_code, used_at DESC);
EXCEPTION WHEN undefined_table THEN NULL; END $$;
