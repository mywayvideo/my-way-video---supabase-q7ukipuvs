DO $$
BEGIN
  INSERT INTO public.app_settings (setting_key, setting_value, description)
  VALUES 
    ('social_instagram', '', 'Link para o perfil do Instagram'),
    ('social_facebook', '', 'Link para a página do Facebook')
  ON CONFLICT (setting_key) DO NOTHING;
END $$;
