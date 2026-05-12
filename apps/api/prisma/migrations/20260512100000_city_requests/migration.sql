-- Customer requests for JasaBersih to expand to their city.
CREATE TABLE IF NOT EXISTS city_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city          VARCHAR(100) NOT NULL,
  province      VARCHAR(100),
  user_id       UUID REFERENCES users(id),
  contact_name  VARCHAR(100),
  contact_phone VARCHAR(30),
  notes         TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_city_requests_city ON city_requests(city);
CREATE INDEX IF NOT EXISTS idx_city_requests_created ON city_requests(created_at DESC);
