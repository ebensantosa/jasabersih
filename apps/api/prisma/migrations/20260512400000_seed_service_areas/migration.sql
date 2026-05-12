-- Seed 14 kota awal yang dilayani JasaBersih. Idempotent: only insert if
-- the (name, city) combo doesn't exist yet. Admin bisa edit / nambah / hapus
-- via /admin/areas.
INSERT INTO service_areas (name, city, centroid, radius_m, surge_multiplier, is_active)
SELECT v.name, v.city,
       ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography,
       15000, 1.0, TRUE
  FROM (VALUES
    ('Semarang Kota',        'Semarang',          110.4167,  -6.9667),
    ('Bandung Kota',         'Bandung',           107.6191,  -6.9175),
    ('Yogyakarta Kota',      'Yogyakarta',        110.3695,  -7.7956),
    ('Bekasi Kota',          'Bekasi',            106.9896,  -6.2349),
    ('Tangerang Kota',       'Tangerang',         106.6300,  -6.1781),
    ('Jakarta Selatan',      'Jakarta Selatan',   106.8106,  -6.2615),
    ('Jakarta Utara',        'Jakarta Utara',     106.8631,  -6.1389),
    ('Jakarta Barat',        'Jakarta Barat',     106.7588,  -6.1683),
    ('Jakarta Timur',        'Jakarta Timur',     106.9004,  -6.2250),
    ('Jakarta Pusat',        'Jakarta Pusat',     106.8344,  -6.1865),
    ('Tangerang Selatan',    'Tangerang Selatan', 106.7177,  -6.2884),
    ('Surabaya Kota',        'Surabaya',          112.7521,  -7.2575),
    ('Denpasar (Bali)',      'Bali',              115.2126,  -8.6705),
    ('Solo (Surakarta)',     'Solo',              110.8243,  -7.5755)
  ) AS v(name, city, lng, lat)
 WHERE NOT EXISTS (
   SELECT 1 FROM service_areas s WHERE s.name = v.name AND s.city = v.city
 );
