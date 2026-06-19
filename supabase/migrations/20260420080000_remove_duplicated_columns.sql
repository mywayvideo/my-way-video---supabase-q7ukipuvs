DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_agent_settings' AND column_name='cache_expiration_days') THEN
    ALTER TABLE public.ai_agent_settings DROP COLUMN cache_expiration_days;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_agent_settings' AND column_name='price_threshold_usd') THEN
    ALTER TABLE public.ai_agent_settings DROP COLUMN price_threshold_usd;
  END IF;
END $$;
