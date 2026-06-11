-- Normalize semua data lama yang pakai spelling 'cancelled' → 'canceled'
-- (admin sebelumnya pakai British spelling, sekarang harmonize ke American)
UPDATE bookings SET status = 'canceled' WHERE status = 'cancelled';
