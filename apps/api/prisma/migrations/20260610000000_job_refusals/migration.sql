-- Track alasan cleaner tolak job offer untuk fraud signal & matching algorithm tuning.
CREATE TABLE IF NOT EXISTS job_offer_refusals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reason_code VARCHAR(50) NOT NULL,
  reason_note TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refusals_cleaner_created ON job_offer_refusals(cleaner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refusals_booking ON job_offer_refusals(booking_id);
