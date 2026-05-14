-- App version check config (admin-editable di /admin/app-settings)
INSERT INTO app_config (key, value, category, description) VALUES
  ('app.latest_version',  '"1.1.0"',                           'app', 'Versi terbaru app. Mobile check vs versi-nya sendiri saat boot'),
  ('app.min_version',     '"1.0.0"',                           'app', 'Versi minimum yang masih support. Di bawah ini force update'),
  ('app.release_notes',   '["Improvements & bug fixes"]',      'app', 'Catatan rilis (array of strings). Tampil di modal update'),
  ('app.force_update',    'false',                             'app', 'true = paksa update bahkan kalau versi lebih dari min_version')
ON CONFLICT (key) DO NOTHING;
