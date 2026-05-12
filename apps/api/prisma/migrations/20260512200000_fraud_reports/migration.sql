-- Customer reports cleaner for off-platform contact / payment / fraud.
-- Approved reports earn the customer a Rp 50k voucher (configurable via
-- app_config 'fraud.report_reward_amount'). One report per booking.
CREATE TABLE IF NOT EXISTS fraud_reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id    UUID REFERENCES bookings(id),
  reporter_id   UUID NOT NULL REFERENCES users(id),
  reported_id   UUID REFERENCES users(id),
  category      VARCHAR(50) NOT NULL,    -- ask_phone | ask_payment_outside | inappropriate | other
  description   TEXT,
  evidence_urls JSONB DEFAULT '[]',      -- screenshots di R2
  status        VARCHAR(20) DEFAULT 'pending', -- pending | approved | rejected
  reward_voucher_code VARCHAR(50),       -- voucher code yang diberikan ke reporter saat approved
  admin_notes   TEXT,
  reviewed_by   UUID REFERENCES admin_users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (booking_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_fraud_reports_status ON fraud_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_reports_reported ON fraud_reports(reported_id);

INSERT INTO app_config (key, value, category, description, updated_at) VALUES
  ('fraud.report_reward_amount', '50000'::jsonb, 'feature', 'Rupiah voucher yang diberikan ke customer saat report fraud di-approve admin.', NOW()),
  ('fraud.report_enabled',       'true'::jsonb,  'feature', 'Aktifkan tombol Report Cleaner di chat / booking detail.', NOW())
ON CONFLICT (key) DO NOTHING;
