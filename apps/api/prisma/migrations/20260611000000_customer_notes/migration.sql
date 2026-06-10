-- Customer notes/preferences yang visible ke cleaner saat handle booking customer ini.
-- Source: 'customer' (customer self-input via profile) atau 'cleaner' (private note dari cleaner)
CREATE TABLE IF NOT EXISTS customer_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source      VARCHAR(20) NOT NULL CHECK (source IN ('customer', 'cleaner')),
  category    VARCHAR(50) NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id, source, category);
