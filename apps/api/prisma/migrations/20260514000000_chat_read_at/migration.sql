-- Track when chat message dibaca recipient — untuk unread badge.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_chat_unread ON chat_messages(recipient_id, read_at) WHERE read_at IS NULL;
