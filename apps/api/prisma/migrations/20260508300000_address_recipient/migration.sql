-- Mobile address book butuh recipient_name + recipient_phone (per-address contact, beda dari user.phone)
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(20);
