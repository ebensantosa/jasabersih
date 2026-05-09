-- Hapus tarif per jam — bisnis pivot ke fixed price only
-- Data lama (booking dengan pricing_mode='hourly') tetap dipertahankan agar history utuh

-- Hapus semua hourly tier (tidak ada FK constraint dari bookings → pricing_hourly_tiers
-- karena bookings.hourly_tier_id ada tapi tanpa enforced FK)
DELETE FROM pricing_hourly_tiers;

-- Hapus app_config related ke hourly kalau ada
DELETE FROM app_config WHERE key LIKE 'hourly.%' OR key LIKE 'pricing.hourly%';
