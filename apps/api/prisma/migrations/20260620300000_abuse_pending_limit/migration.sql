-- Anti-spam: limit jumlah booking pending_payment concurrent per user.
-- Default 5 - cukup buat power user (multi-order), cukup ketat buat anti-spam.
INSERT INTO app_config (key, value, category, description)
VALUES
  ('abuse.max_pending_payment_bookings', '5', 'abuse',
   'Max booking belum dibayar concurrent per customer (24 jam window). 0 = no limit. Default 5.')
ON CONFLICT (key) DO NOTHING;
