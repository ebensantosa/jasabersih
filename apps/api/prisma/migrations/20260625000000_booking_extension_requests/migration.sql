-- Extension requests: customer minta perpanjangan waktu ke cleaner (per-ruangan saja)
CREATE TABLE IF NOT EXISTS booking_extension_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id),
  cleaner_id UUID NOT NULL REFERENCES users(id),
  hours_requested INT NOT NULL DEFAULT 1,
  price_per_hour BIGINT NOT NULL,
  total_price BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  created_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ber_booking ON booking_extension_requests(booking_id);
