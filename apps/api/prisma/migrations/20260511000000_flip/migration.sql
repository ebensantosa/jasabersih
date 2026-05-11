-- Flip.id payment provider columns. Generic `provider` so we can support
-- multiple gateways side-by-side; flip_bill_id is the Flip-specific ref.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider VARCHAR(20);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS flip_bill_id VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS flip_link_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_payments_flip_bill ON payments(flip_bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_flip_link ON payments(flip_link_id);

-- Seed Flip config rows so admin sees them under /admin/app-settings (category=payment)
INSERT INTO app_config (key, value, category, description, updated_at) VALUES
  ('payment.flip_enabled',          'false'::jsonb, 'payment', 'Aktifkan Flip sebagai payment gateway. Set true setelah credential terisi.', NOW()),
  ('payment.flip_is_production',    'false'::jsonb, 'payment', 'true = pakai bigflip.id production. false = sandbox.', NOW()),
  ('payment.flip_secret_key',       '""'::jsonb,    'payment', 'Secret key dari Flip for Business dashboard (Settings → API & Callback).', NOW()),
  ('payment.flip_validation_token', '""'::jsonb,    'payment', 'Validation Token dari Flip — dipakai verify callback signature.', NOW())
ON CONFLICT (key) DO NOTHING;
