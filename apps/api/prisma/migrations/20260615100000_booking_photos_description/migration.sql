-- Tambah kolom description ke booking_photos untuk damage report.
-- Cleaner wajib isi alasan kerusakan (selain foto) supaya admin & customer
-- punya konteks saat review sengketa. Untuk before/after, kolom nullable.
ALTER TABLE booking_photos ADD COLUMN IF NOT EXISTS description TEXT NULL;
