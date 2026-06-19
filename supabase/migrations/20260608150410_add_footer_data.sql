DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.company_info WHERE type = 'footer_about') THEN
    INSERT INTO public.company_info (type, content)
    VALUES ('footer_about', 'Inteligência em Audiovisual PRO. O futuro das soluções para o seu projeto com tecnologia avançada.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'company_address') THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('company_address', 'Av. Paulista, 1000 - São Paulo, SP');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'company_phone') THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('company_phone', '+55 11 99999-9999');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'company_email') THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('company_email', 'contato@mywayvideo.com');
  END IF;
END $$;
