DO $$
BEGIN
  ALTER TABLE public.ai_agent_settings
    ALTER COLUMN whatsapp_trigger_purchase_keywords TYPE text[] USING NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error altering whatsapp_trigger_purchase_keywords: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE public.ai_agent_settings
    ALTER COLUMN whatsapp_trigger_project_keywords TYPE text[] USING NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error altering whatsapp_trigger_project_keywords: %', SQLERRM;
END $$;
