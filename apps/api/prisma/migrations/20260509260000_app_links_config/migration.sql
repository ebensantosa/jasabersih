-- Seed default app store links + deep link scheme — admin bisa edit di /admin/app-settings
INSERT INTO app_config (key, value, category, description) VALUES
  ('app.play_store_url', '"https://play.google.com/store/apps/details?id=com.jasabersih.app"', 'app', 'URL Google Play Store untuk download app Android'),
  ('app.app_store_url',  '"https://apps.apple.com/id/app/jasabersih/id000000000"', 'app', 'URL Apple App Store untuk download app iOS'),
  ('app.deep_link_scheme', '"jasabersih://referral"', 'app', 'Deep link scheme untuk auto-open app dari referral link (jasabersih://referral/CODE)')
ON CONFLICT (key) DO NOTHING;
