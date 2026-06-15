-- Seed/update commission tiers ke nilai final yg disetujui owner.
-- Rumus:
--   <300K       -> NoTools 40%, WithTools 60%
--   300K-600K   -> NoTools 40%, WithTools 55%
--   >600K       -> NoTools 40%, WithTools 50%
--
-- Strategy: hapus dulu semua tier existing, lalu insert clean. Idempotent
-- karena DELETE + INSERT (kalau jalan ulang, hasil sama).
DELETE FROM commission_tiers;

INSERT INTO commission_tiers (range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools)
VALUES
  (0,      299999,  40.00, 60.00),
  (300000, 599999,  40.00, 55.00),
  (600000, NULL,    40.00, 50.00);
