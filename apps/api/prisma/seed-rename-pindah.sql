-- Rename "Pindah Kost" → "Pindah Kamar"
UPDATE services SET name = 'Pindah Kamar', description = 'Cleaning kamar kosongan (serah terima)' WHERE code = 'pindah_kos';
UPDATE pricing_packages SET name = 'Pindah Kamar' WHERE service_id = (SELECT id FROM services WHERE code = 'pindah_kos');
SELECT code, name FROM services WHERE code = 'pindah_kos';
