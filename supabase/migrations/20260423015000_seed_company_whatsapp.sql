DO $$
BEGIN
  INSERT INTO public.app_settings (setting_key, setting_value)
  VALUES ('company_whatsapp', '+1-786-716-1170')
  ON CONFLICT (setting_key) DO NOTHING;
END $$;
