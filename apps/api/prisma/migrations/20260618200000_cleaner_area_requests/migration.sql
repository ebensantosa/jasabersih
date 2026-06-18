-- Cleaner request tambah area kerja. Admin yang accept/reject.
-- Ini beda dari city_requests (yang request BUKA kota baru) -
-- ini request ADD area ke cleaner specific dari kota yang sudah aktif.
CREATE TABLE IF NOT EXISTS cleaner_area_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cleaner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city          VARCHAR(100) NOT NULL,
  notes         TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_at   TIMESTAMPTZ,
  reviewed_by_admin_id UUID REFERENCES users(id),
  reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cleaner_area_requests_cleaner ON cleaner_area_requests(cleaner_id, status);
CREATE INDEX IF NOT EXISTS idx_cleaner_area_requests_status ON cleaner_area_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cleaner_area_pending ON cleaner_area_requests(cleaner_id, lower(trim(city))) WHERE status = 'pending';
