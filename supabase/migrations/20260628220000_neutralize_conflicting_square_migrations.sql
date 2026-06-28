-- This migration ensures idempotency after the removal of conflicting migration files:
-- 20260628173000_seed_square_credentials.sql (deleted)
-- 20260628184812_fix_square_env_consistency.sql (deleted)
--
-- Ensure production Square credentials are set correctly without overwriting existing values.
-- The environment is now detected by the square_application_id prefix in the edge function:
--   sq0idp-        → Production (https://connect.squareup.com)
--   sandbox-sq0idb- → Sandbox (https://connect.squareupsandbox.com)

-- Only insert if the key does not already exist (do not overwrite)
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('square_application_id', 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'),
  ('square_access_token', 'EAAAl9Qk53Bt2PL9_2MmuS97OscxzUt2UOJ3-yXwgbdMhRe3Qsd6nwEg2deh6EYa'),
  ('square_location_id', 'L18BWSS4TTJ6X')
ON CONFLICT (setting_key) DO NOTHING;

-- If a previous migration set the application_id to sandbox format, revert to production
UPDATE public.app_settings
SET setting_value = 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'
WHERE setting_key = 'square_application_id'
  AND setting_value LIKE 'sandbox-%';
