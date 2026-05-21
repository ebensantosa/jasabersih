-- Business rules: cancellation policy, cleaner schedule, foto wajib, inactivity.

-- Bookings: kolom untuk cancellation/no-show tracking + multi-worker
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancellation_fee BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS before_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS after_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS worker_count INT NOT NULL DEFAULT 1;

-- Multi-cleaner job: lead cleaner di bookings.cleaner_id, helpers di sini.
-- Catatan: bookings partitioned (PK composite id+created_at), jadi FK booking_id gak pakai REFERENCES.
-- Integrity di-handle di app layer + index untuk lookup.
CREATE TABLE IF NOT EXISTS booking_helpers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID NOT NULL,
  cleaner_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL DEFAULT 'invited', -- invited|accepted|declined|removed
  invited_by  UUID NOT NULL REFERENCES users(id),
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at  TIMESTAMPTZ,
  UNIQUE (booking_id, cleaner_id)
);
CREATE INDEX IF NOT EXISTS booking_helpers_cleaner_status_idx ON booking_helpers (cleaner_id, status);
CREATE INDEX IF NOT EXISTS booking_helpers_booking_idx ON booking_helpers (booking_id);

-- Referrals: link ke first booking biar bisa di-track sampe complete.
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS first_booking_id UUID;

-- Cleaner working hours: simple schema, hari per minggu + jam start/end
CREATE TABLE IF NOT EXISTS cleaner_working_hours (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week  INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Minggu, 6=Sabtu
  start_minute INT NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute   INT NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  PRIMARY KEY (user_id, day_of_week)
);

-- Default config untuk policy ini — admin tetap bisa override.
INSERT INTO app_config (key, value, description, category) VALUES
  ('cancel.free_window_hours',          '6',    'Jam minimum sebelum jadwal untuk free cancel.', 'cancellation'),
  ('cancel.late_fee_percent',           '25',   'Persen potongan kalau cancel < free_window_hours.', 'cancellation'),
  ('cancel.no_show_fee_percent',        '100',  'Persen potongan kalau customer no-show.', 'cancellation'),
  ('cleaner.withdraw_min_amount',       '50000', 'Minimum withdraw cleaner per request (IDR).', 'withdrawal'),
  ('cleaner.withdraw_max_per_day',      '1',    'Maks withdraw cleaner per hari.', 'withdrawal'),
  ('cleaner.inactivity_suspend_days',   '14',   'Hari tanpa aktivitas → cleaner auto-suspend.', 'cleaner'),
  ('cleaner.require_after_photo',       'true', 'Cleaner wajib upload foto AFTER sebelum tandai selesai.', 'cleaner'),
  ('cs.whatsapp_number',                '"+6281234567890"', 'Nomor WhatsApp CS untuk OUT_OF_RANGE & dispute manual.', 'support'),
  ('referral.referred_discount_idr',    '25000', 'Diskon yang didapat user baru saat pakai kode referral di order pertama.', 'referral'),
  ('referral.referrer_bonus_idr',       '25000', 'Bonus saldo yang dikasih ke referrer saat referred user menyelesaikan order pertama.', 'referral')
ON CONFLICT (key) DO NOTHING;
