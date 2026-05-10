-- Tambah flag `show_on_home` ke services biar admin bisa pilih mana yang muncul di home grid
-- Default TRUE — backwards compatible (semua existing service tetap muncul)

ALTER TABLE services ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN DEFAULT TRUE;

-- Bundle services + subscription default-nya FALSE — mereka punya section sendiri
UPDATE services SET show_on_home = FALSE
 WHERE code IN ('full_house', 'kantor', 'pasca_renovasi', 'subscription', 'paket_bundle');
