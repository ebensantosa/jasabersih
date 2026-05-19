-- Anti-abuse limits — semua admin-configurable via /admin/app-config UI.

INSERT INTO app_config (key, value, description, category) VALUES
  ('abuse.chat_msg_per_min',     '15',  'Maks pesan chat per menit per user per booking. 0 = matikan limit.', 'abuse'),
  ('abuse.max_active_bookings',  '3',   'Maks booking aktif simultan per customer (status searching/matched/in_progress). 0 = unlimited.', 'abuse'),
  ('abuse.max_open_disputes_same_cleaner', '1', 'Maks dispute open dari 1 customer ke cleaner yang sama. 0 = unlimited.', 'abuse'),
  ('abuse.rating_edit_window_hours', '24', 'Jam window customer boleh edit rating setelah submit. 0 = gak boleh edit setelah submit.', 'abuse'),
  ('abuse.voucher_max_uses_per_phone', '1', 'Maks 1 voucher code dipakai berapa kali per nomor HP. 0 = unlimited.', 'abuse'),
  ('abuse.reschedule_max_per_booking', '1', 'Maks reschedule per booking. 0 = gak boleh reschedule.', 'abuse')
ON CONFLICT (key) DO NOTHING;

-- Track voucher usage per phone (untuk enforce limit).
CREATE TABLE IF NOT EXISTS voucher_usage_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_code VARCHAR(50) NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone        VARCHAR(20) NOT NULL,
  booking_id   UUID,
  used_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS voucher_usage_phone_code_idx ON voucher_usage_log (phone, voucher_code);
CREATE INDEX IF NOT EXISTS voucher_usage_user_code_idx ON voucher_usage_log (user_id, voucher_code);

-- Rating dup detection enforced in code (cegah failed migration kalau ada dup history).
