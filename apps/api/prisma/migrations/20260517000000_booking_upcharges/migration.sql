-- Upcharge: cleaner request charge tambahan saat kondisi di lapangan lebih kotor.
-- Customer approve/reject. Approved → total_amount + cleaner_payout naik.
CREATE TABLE IF NOT EXISTS booking_upcharges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL,
  cleaner_id UUID REFERENCES users(id),
  amount BIGINT NOT NULL,
  reason TEXT NOT NULL,
  photo_url VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by_user_id UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_upcharges_booking ON booking_upcharges(booking_id);
CREATE INDEX IF NOT EXISTS idx_upcharges_pending ON booking_upcharges(status) WHERE status = 'pending';
