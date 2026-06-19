DO $$
BEGIN
  INSERT INTO public.app_settings (setting_key, setting_value, description)
  VALUES ('company_admin_email', 'admin@mywayvideo.com', 'Administrative contact email for policy pages')
  ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
END $$;
