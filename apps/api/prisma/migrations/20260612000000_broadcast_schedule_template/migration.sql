-- Scheduled broadcasts: admin bisa jadwalin push delivery di waktu tertentu.
CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       VARCHAR(100) NOT NULL,
  body        TEXT NOT NULL,
  audience    VARCHAR(50) NOT NULL,
  cta_link    TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | cancelled | failed
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ,
  sent_count  INT,
  failed_count INT,
  error_msg   TEXT
);
CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_pending ON scheduled_broadcasts(scheduled_at)
  WHERE status = 'pending';

-- Broadcast templates: simpan template untuk reuse
CREATE TABLE IF NOT EXISTS broadcast_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  title       VARCHAR(100) NOT NULL,
  body        TEXT NOT NULL,
  audience    VARCHAR(50) NOT NULL,
  cta_link    TEXT,
  category    VARCHAR(50), -- 'promo', 'announcement', 'reminder', dll
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_count  INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ
);
