-- Tambah banner ajakan referral di home (placement = home_hero, sort_order = 0 biar nongol pertama)
INSERT INTO cms_banners (title, subtitle, image_url, link_url, placement, sort_order, is_active) VALUES
  ('Ajak Teman, Dapat Rp 25.000',
   'Bagikan kode referral kamu — bonus masuk wallet tiap teman selesai order pertama',
   'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=800&q=70',
   '/account/referral',
   'home_hero',
   0,
   TRUE)
ON CONFLICT DO NOTHING;
