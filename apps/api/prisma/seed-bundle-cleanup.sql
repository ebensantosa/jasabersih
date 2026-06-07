-- ============================================================
-- Cleanup confusing bundle services
-- 'Paket Bundle' itu nama yang rancu — bundle apa? Hapus, biarin
-- bundle yang jelas: Full House, Berlangganan Bulanan, Pasca Renovasi.
-- ============================================================

BEGIN;

-- Deactivate paket_bundle (rancu, gak jelas isinya apa)
UPDATE services SET is_active = false WHERE code = 'paket_bundle';
UPDATE pricing_packages SET is_active = false
 WHERE service_id = (SELECT id FROM services WHERE code = 'paket_bundle');

-- Deactivate general_cleaning & deep_cleaning sebagai standalone service
-- (sudah jadi MODE di booking biasa via toggle Deep Cleaning, bukan service sendiri)
UPDATE services SET is_active = false WHERE code IN ('general_cleaning', 'deep_cleaning');
UPDATE pricing_packages SET is_active = false
 WHERE service_id IN (SELECT id FROM services WHERE code IN ('general_cleaning', 'deep_cleaning'));

-- Deactivate 'kos' standalone (sudah ada 'pindah_kos' yang jelas)
UPDATE services SET is_active = false WHERE code = 'kos';
UPDATE pricing_packages SET is_active = false
 WHERE service_id = (SELECT id FROM services WHERE code = 'kos');

-- Deactivate 'kantor' lama (sudah ada service 'kantor' baru dengan per-meter pricing)
-- — handled di seed-per-meter-services.sql via ON CONFLICT; kalau lama gak ke-update,
--   pastikan packages lama yang gak per-meter di-nonaktifkan.
-- (Skip karena seed-per-meter-services udah aktifkan ulang dengan benar)

COMMIT;

-- Verify
SELECT code, name, is_active FROM services ORDER BY display_order, name;
