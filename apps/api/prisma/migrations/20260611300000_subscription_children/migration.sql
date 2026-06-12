-- Subscription child bookings: parent (paket langganan) → N child (per visit).
-- Setiap child = booking independent (foto, rating, payout, dispute sendiri).
-- NOTE: bookings is partitioned, so kita gak bisa add FK ke bookings(id). Pakai UUID standalone + app-level cleanup.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS parent_booking_id UUID;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS subscription_visit_index INT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS subscription_total_visits INT;

CREATE INDEX IF NOT EXISTS idx_bookings_parent ON bookings(parent_booking_id) WHERE parent_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_subscription_future ON bookings(scheduled_at, status)
  WHERE parent_booking_id IS NOT NULL AND status = 'scheduled_future';
