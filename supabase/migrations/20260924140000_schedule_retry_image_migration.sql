-- Migration: trigger_retry_image_migration and pg_cron schedule
-- Runs during lowest blocking window: 01h to 06h BRT (04h to 09h UTC)

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.trigger_retry_image_migration()
RETURNS void AS $$
DECLARE
  v_service_role_key text;
BEGIN
  SELECT setting_value INTO v_service_role_key
  FROM public.app_settings
  WHERE setting_key = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_service_role_key
      FROM vault.decrypted_secrets
      WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_service_role_key := NULL;
    END;
  END IF;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    RAISE NOTICE 'SUPABASE_SERVICE_ROLE_KEY not found in app_settings or vault.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/retry-image-migration',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := '{"limit": 30}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cron job: runs at minute 05 of hours 4, 5, 6, 7, 8, 9 UTC (01h, 02h, 03h, 04h, 05h, 06h BRT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry-image-migration-cron') THEN
    PERFORM cron.unschedule('retry-image-migration-cron');
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'retry-image-migration-cron',
    '5 4,5,6,7,8,9 * * *',
    'SELECT public.trigger_retry_image_migration()'
  );
END $$;
