DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.company_info WHERE type = 'footer_about') THEN
    INSERT INTO public.company_info (type, content) 
    VALUES ('footer_about', 'Seu parceiro definitivo em equipamentos de audiovisual profissional. Qualidade, garantia e suporte técnico especializado.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.company_info WHERE type = 'ai_knowledge') THEN
    INSERT INTO public.company_info (type, content) 
    VALUES ('ai_knowledge', 'My Way Video é especialista em audiovisual PRO. Nós entregamos no Brasil e oferecemos suporte total na importação e aquisição de equipamentos.');
  END IF;
END $$;
