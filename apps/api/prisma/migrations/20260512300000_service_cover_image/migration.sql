-- Cover image (hero/banner) untuk halaman detail layanan di mobile.
-- icon_url = thumbnail kecil di list, cover_image_url = banner besar di detail.
ALTER TABLE services ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500);
