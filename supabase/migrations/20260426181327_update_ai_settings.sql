ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS intent_mapping JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS technical_bridge JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_stop_words TEXT;

ALTER TABLE public.ai_agent_settings
  ADD COLUMN IF NOT EXISTS proactivity_level INTEGER DEFAULT 5;
