-- Migration: 20261001000001_schedule_ncm_support_vigencia_cron.sql
-- Agendamento semanal da rotina de vigência da tabela ncm_support com Siscomex e expiração de Ex
-- Executa todo domingo às 03:00 UTC (00:00 BRT)

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.trigger_sync_ncm_support_vigencia()
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
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/sync-ncm-support-vigencia',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Agenda semanalmente aos domingos às 03:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ncm-support-vigencia-weekly') THEN
    PERFORM cron.unschedule('sync-ncm-support-vigencia-weekly');
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'sync-ncm-support-vigencia-weekly',
    '0 3 * * 0',
    'SELECT public.trigger_sync_ncm_support_vigencia()'
  );
END $$;
