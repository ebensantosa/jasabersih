-- Cleaner domicile city (kota tempat tinggal/kerja utama).
-- Wajib di-set saat register cleaner, dipilih dari list service_areas yang
-- admin sudah buka. Kalau kota cleaner belum ada → request via app, admin acc.
ALTER TABLE cleaner_profiles
  ADD COLUMN IF NOT EXISTS domicile_city VARCHAR(100);

-- Source = siapa yang request (customer mau dilayani, atau cleaner mau kerja).
-- Status = pending/approved/rejected, supaya admin bisa track action.
ALTER TABLE city_requests
  ADD COLUMN IF NOT EXISTS source  VARCHAR(20) NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS status  VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_city_requests_source_status ON city_requests(source, status);
