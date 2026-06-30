-- Call sessions: track every voice call attempt between customer & cleaner
CREATE TABLE call_sessions (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID         NOT NULL,
  initiator_id  UUID         NOT NULL REFERENCES users(id),
  recipient_id  UUID         REFERENCES users(id),
  started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  answered_at   TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  duration_sec  INT,
  end_reason    VARCHAR(20),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_sessions_booking  ON call_sessions(booking_id);
CREATE INDEX idx_call_sessions_started  ON call_sessions(started_at DESC);
-- Partial index for active calls (no ended_at)
CREATE INDEX idx_call_sessions_active   ON call_sessions(ended_at) WHERE ended_at IS NULL;

-- Seed feature flag defaults if not already present
INSERT INTO app_config (key, value, updated_by)
VALUES
  ('feature.call_enabled',       'true',  NULL),
  ('call.max_duration_minutes',  '30',    NULL)
ON CONFLICT (key) DO NOTHING;
