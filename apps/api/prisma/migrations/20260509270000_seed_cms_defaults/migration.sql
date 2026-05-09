-- Seed default CMS rows biar admin Content/CMS gak tampil kosong:
-- banners (3 default), announcement (1), service areas (Yogyakarta region)
-- Mirror dari fallback hardcoded di mobile app/src/data/catalog.ts

-- 1. CMS Banners (placement = 'home_hero')
INSERT INTO cms_banners (title, subtitle, image_url, link_url, placement, sort_order, is_active) VALUES
  ('Diskon 20% Pesanan Pertama', 'Pakai kode HEMAT20 di checkout',
   'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=70',
   '/(tabs)/explore', 'home_hero', 1, TRUE),
  ('Full House Mulai Rp 350rb', 'Bersih seluruh rumah, sekali jadi',
   'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=70',
   '/services/full_house', 'home_hero', 2, TRUE),
  ('Konsultasi Gratis via WhatsApp', 'Properti besar / kompleks? Survey dulu',
   'https://images.unsplash.com/photo-1581092446327-9b52bd1570c2?auto=format&fit=crop&w=800&q=70',
   '/booking/wa-survey', 'home_hero', 3, TRUE)
ON CONFLICT DO NOTHING;

-- 2. Announcement awal (info launch)
INSERT INTO cms_announcements (title, body, severity, audience, is_active) VALUES
  ('Selamat Datang di JasaBersih!',
   'Aplikasi resmi JasaBersih.com — booking cleaner profesional di Yogyakarta & sekitarnya. Pakai kode HEMAT20 untuk diskon Rp 25.000 di order pertama!',
   'info', 'all', TRUE)
ON CONFLICT DO NOTHING;

-- 3. Service areas (Yogyakarta region — sesuai fokus bisnis)
-- centroid wajib (NOT NULL) — koordinat pusat tiap kabupaten/kota
INSERT INTO service_areas (name, city, centroid, radius_m, is_active) VALUES
  ('Yogyakarta Kota', 'Yogyakarta', ST_SetSRID(ST_MakePoint(110.3695, -7.7956), 4326)::geography, 8000, TRUE),
  ('Sleman',          'Sleman',     ST_SetSRID(ST_MakePoint(110.3500, -7.7167), 4326)::geography, 12000, TRUE),
  ('Bantul',          'Bantul',     ST_SetSRID(ST_MakePoint(110.3293, -7.8884), 4326)::geography, 10000, TRUE),
  ('Kulon Progo',     'Kulon Progo',ST_SetSRID(ST_MakePoint(110.1606, -7.8266), 4326)::geography, 15000, TRUE),
  ('Gunung Kidul',    'Gunung Kidul',ST_SetSRID(ST_MakePoint(110.6029, -7.9658), 4326)::geography, 20000, TRUE)
ON CONFLICT DO NOTHING;
