DO $$
BEGIN
  -- Insere o conteúdo base para o footer_about, caso não exista
  IF NOT EXISTS (SELECT 1 FROM public.company_info WHERE type = 'footer_about') THEN
    INSERT INTO public.company_info (type, content)
    VALUES ('footer_about', 'Inteligência em Audiovisual PRO. As melhores soluções para o seu projeto.');
  END IF;

  -- Insere os contatos base na tabela app_settings, caso não existam
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'company_address') THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('company_address', 'Miami, FL - USA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'company_phone') THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('company_phone', '+1 (305) 555-0199');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'company_email') THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('company_email', 'contact@mywayvideo.com');
  END IF;
END $$;
