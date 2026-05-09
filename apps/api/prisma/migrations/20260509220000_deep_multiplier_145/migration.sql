-- Update deep cleaning multiplier dari 1.5 ke 1.45 sesuai pricing baru
-- Hasil dibulatkan ke atas per 1000 di sisi mobile (lihat applyCleanMode di stores/cleaningMode.ts)

UPDATE app_config
   SET value = '1.45',
       description = 'Multiplier biaya untuk deep cleaning vs general cleaning (1.45 = +45%, hasil dibulatkan ke atas per 1000)'
 WHERE key = 'pricing.deep_clean_multiplier';
