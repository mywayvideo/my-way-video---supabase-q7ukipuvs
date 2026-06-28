-- Neutralize problematic seed data from earlier migrations
-- and ensure production credentials are not overwritten on future deploys

-- 1. Ensure square credentials exist but DO NOT overwrite manually configured values
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('square_application_id', 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'),
  ('square_location_id', 'L18BWSS4TTJ6X')
ON CONFLICT (setting_key) DO NOTHING;

-- 2. Only insert square_access_token if it doesn't exist (never overwrite)
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('square_access_token', 'EAAAl9Qk53Bt2PL9_2MmuS97OscxzUt2UOJ3-yXwgbdMhRe3Qsd6nwEg2deh6EYa')
ON CONFLICT (setting_key) DO NOTHING;

-- 3. If the application_id was set to sandbox by migration 20260628184812,
--    and it hasn't been manually changed since, revert to production format
UPDATE public.app_settings
SET setting_value = 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'
WHERE setting_key = 'square_application_id'
  AND setting_value = 'sandbox-sq0idb-OHYfHUECJ_anf5-s5ZuttQ';
