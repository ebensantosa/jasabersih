-- Tripay payment integration columns
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tripay_reference VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tripay_merchant_ref VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pay_code VARCHAR(50);     -- VA number / QRIS code / etc
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pay_method_code VARCHAR(20); -- BCAVA / BRIVA / QRIS / etc
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_received BIGINT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fee BIGINT DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS callback_payload JSONB;
CREATE INDEX IF NOT EXISTS idx_payments_tripay_ref ON payments(tripay_reference);
CREATE INDEX IF NOT EXISTS idx_payments_merchant_ref ON payments(tripay_merchant_ref);
