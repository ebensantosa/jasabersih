-- Tambahan payment_type + extra_metadata supaya Flip callback bisa identify
-- payment untuk upcharge / tip vs booking-normal, lalu finalize sesuai context.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_type    VARCHAR(20) NOT NULL DEFAULT 'booking',
  ADD COLUMN IF NOT EXISTS extra_metadata  JSONB;

-- Index supaya callback resolver cepat (cari payment by linkId udah ada,
-- tapi report admin mungkin filter by payment_type).
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
