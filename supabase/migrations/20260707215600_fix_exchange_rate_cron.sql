CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.trigger_exchange_rate_update()
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
    RAISE NOTICE 'SUPABASE_SERVICE_ROLE_KEY not found. Store it in app_settings (setting_key = ''SUPABASE_SERVICE_ROLE_KEY'') or vault.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/update-exchange-rate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-exchange-rate-cron') THEN
    PERFORM cron.unschedule('update-exchange-rate-cron');
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'update-exchange-rate-cron',
    '15 12,15,18,21 * * *',
    'SELECT public.trigger_exchange_rate_update()'
  );
END $$;
