INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('square_application_id', 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'),
  ('square_access_token', 'EAAAl9Qk53Bt2PL9_2MmuS97OscxzUt2UOJ3-yXwgbdMhRe3Qsd6nwEg2deh6EYa'),
  ('square_location_id', 'L18BWSS4TTJ6X')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
