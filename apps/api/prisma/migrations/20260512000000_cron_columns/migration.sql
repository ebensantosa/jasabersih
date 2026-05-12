-- Idempotency markers for cron-driven push reminders.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cleaner_reminder_sent_at  TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rating_reminder_sent_at   TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_notes               TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS admin_notes               TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_cleaner_reminder
  ON bookings(scheduled_at)
  WHERE status = 'matched' AND cleaner_reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_customer_reminder
  ON bookings(scheduled_at)
  WHERE status = 'matched' AND customer_reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_rating_reminder
  ON bookings(completed_at)
  WHERE status = 'completed' AND rating_reminder_sent_at IS NULL;
