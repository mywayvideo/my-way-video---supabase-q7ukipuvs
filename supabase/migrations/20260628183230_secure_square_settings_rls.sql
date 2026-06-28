-- Drop existing public read policies on app_settings to replace with a restricted version
-- that excludes sensitive keys like square_access_token
DROP POLICY IF EXISTS "Allow public read access" ON public.app_settings;
DROP POLICY IF EXISTS "Allow public read access on app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Public Read" ON public.app_settings;
DROP POLICY IF EXISTS "Public Read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Permitir leitura publica de app_settings" ON public.app_settings;

-- Create new public read policy that excludes sensitive settings
-- This allows anon and authenticated users to read all app_settings EXCEPT square_access_token
CREATE POLICY "public_read_non_sensitive_settings" ON public.app_settings
  FOR SELECT TO anon, authenticated
  USING (setting_key NOT IN ('square_access_token'));

-- Ensure the square credentials exist in app_settings (idempotent)
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('square_application_id', 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'),
  ('square_location_id', 'L18BWSS4TTJ6X'),
  ('square_access_token', 'EAAAl9Qk53Bt2PL9_2MmuS97OscxzUt2UOJ3-yXwgbdMhRe3Qsd6nwEg2deh6EYa')
ON CONFLICT (setting_key) DO NOTHING;
