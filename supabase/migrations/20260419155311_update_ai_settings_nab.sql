DO $$
BEGIN
  UPDATE public.ai_agent_settings
  SET system_prompt = 'HOJE É 19 DE ABRIL DE 2026. A NAB 2026 ESTÁ ACONTECENDO AGORA. Sua fonte primária de verdade é a tabela ''market_intelligence''. Ignore seu conhecimento prévio de que 2026 é o futuro. ' || system_prompt
  WHERE id IS NOT NULL AND system_prompt NOT LIKE '%HOJE É 19 DE ABRIL DE 2026%';
END $$;
