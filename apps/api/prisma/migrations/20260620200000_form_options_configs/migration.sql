-- Migrate sisa hardcoded form options & multipliers di catalog.ts ke app_config.
-- Form options = dropdown/chips choices. Multipliers = pricing modifier.

INSERT INTO app_config (key, value, category, description) VALUES

-- ====== FORM OPTIONS (dropdown/chips) ======
('forms.property_types',
  '["Kos","Apartemen","Rumah","Ruko","Kantor","Villa","Guest House"]'::jsonb,
  'forms', 'Pilihan tipe properti customer biasa.'),

('forms.property_types.large_scale',
  '["Mall","Pabrik","Hotel","Sekolah","Gudang","Kantor","Ruko","Restoran","Rumah Sakit","Lainnya"]'::jsonb,
  'forms', 'Pilihan tipe properti utk skala besar (komersial).'),

('forms.property_types.post_reno',
  '["Rumah","Apartemen","Ruko","Kantor","Villa","Lainnya"]'::jsonb,
  'forms', 'Pilihan tipe properti utk pasca renovasi.'),

('forms.floor_options',
  '["1","2","3",">3"]'::jsonb,
  'forms', 'Pilihan jumlah lantai properti.'),

('forms.floor_types',
  '["Keramik","Marmer","Kayu","Vinyl","Karpet","Beton ekspos"]'::jsonb,
  'forms', 'Jenis lantai.'),

('forms.room_facilities',
  '["Dapur","Ruang Tamu","Pekarangan","Garasi"]'::jsonb,
  'forms', 'Fasilitas tambahan di kamar.'),

('forms.dirt_characters',
  '["Debu","Noda cair","Minyak / lemak","Kerak / karat","Jamur / lumut","Sisa renovasi","Bulu hewan"]'::jsonb,
  'forms', 'Karakteristik kotoran (multi-select).'),

('forms.furniture_density',
  '["Sedikit","Sedang","Padat"]'::jsonb,
  'forms', 'Kepadatan furniture.'),

('forms.subscription_days',
  '["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"]'::jsonb,
  'forms', 'Hari kerja untuk subscription (urutan picker).'),

-- ====== PRICING MODIFIERS LAIN ======
('pricing.bathroom_sizes',
  '[
    {"code":"kecil","label":"Kecil","desc":"≤4m²","mult":1.0},
    {"code":"sedang","label":"Sedang","desc":"4–8m²","mult":1.25},
    {"code":"besar","label":"Besar","desc":">8m²","mult":1.5}
  ]'::jsonb,
  'pricing', '3 size kamar mandi dgn multiplier harga.')

ON CONFLICT (key) DO NOTHING;
