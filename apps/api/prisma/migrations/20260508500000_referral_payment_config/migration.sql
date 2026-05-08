-- Tambah config keys untuk referral & payment gateway agar bisa diedit dari /admin/app-settings
INSERT INTO app_config (key, value, category, description) VALUES
  ('referral.bonus_amount',      '25000',                                  'feature', 'Bonus referral (Rp) — referrer dapat saat referred user complete order pertama'),
  ('referral.enabled',           'true',                                   'feature', 'Aktifkan/non-aktifkan sistem referral'),
  ('referral.min_order_amount',  '100000',                                 'feature', 'Min order amount referred user untuk trigger payout (Rp)'),

  ('payment.active_gateway',     '"tripay"',                               'feature', 'Payment gateway aktif: tripay / midtrans / manual'),
  ('payment.tripay_base_url',    '"https://tripay.co.id/api-sandbox"',     'feature', 'Tripay API base URL — sandbox atau production'),
  ('payment.tripay_merchant_code','""',                                    'feature', 'Tripay merchant code (T-XXXXX) — dari dashboard tripay.co.id'),
  ('payment.tripay_api_key',     '""',                                     'feature', 'Tripay API key (SENSITIVE — jangan share)'),
  ('payment.tripay_private_key', '""',                                     'feature', 'Tripay private key (SENSITIVE — untuk HMAC signature, wajib dirahasiakan)'),

  ('payment.midtrans_server_key','""',                                     'feature', 'Midtrans Server Key (SENSITIVE)'),
  ('payment.midtrans_client_key','""',                                     'feature', 'Midtrans Client Key'),
  ('payment.midtrans_is_production','false',                               'feature', 'Midtrans production mode (true) atau sandbox (false)')
ON CONFLICT (key) DO NOTHING;
