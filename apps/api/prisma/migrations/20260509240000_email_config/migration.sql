-- Seed default email config rows so admin tab "Email" punya placeholder
-- API key dikosongkan (admin set via dashboard / .env)

INSERT INTO app_config (key, value, category, description) VALUES
  ('email.resend_api_key', '""', 'email', 'Resend API key (dapatkan di resend.com/api-keys). Kosong = email disabled.'),
  ('email.from_address',  '"noreply@jasabersih.com"', 'email', 'Alamat pengirim email (harus terdaftar di Resend domain verified)'),
  ('email.from_name',     '"JasaBersih"', 'email', 'Nama pengirim yang muncul di inbox')
ON CONFLICT (key) DO NOTHING;
