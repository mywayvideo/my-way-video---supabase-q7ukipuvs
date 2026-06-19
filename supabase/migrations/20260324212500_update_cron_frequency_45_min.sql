-- Enable required extensions for scheduled network requests (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Remove existing job if it exists to ensure idempotency
  IF EXISTS (
    SELECT 1 
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'cron' AND c.relname = 'job'
  ) THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-exchange-rate-cron') THEN
      PERFORM cron.unschedule('update-exchange-rate-cron');
    END IF;
  END IF;
  
  -- Schedule the job to run every 45 minutes
  -- This calls the edge function to update the exchange rate
  PERFORM cron.schedule(
    'update-exchange-rate-cron',
    '*/45 * * * *',
    $CRON$
      SELECT net.http_post(
        url := 'https://okpxxlpvqotwijisksui.supabase.co/functions/v1/update-exchange-rate',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $CRON$
  );
END $$;
