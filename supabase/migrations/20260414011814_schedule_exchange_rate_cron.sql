CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $DO$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-exchange-rate-cron') THEN
    PERFORM cron.unschedule('update-exchange-rate-cron');
  END IF;
  
  PERFORM cron.schedule(
    'update-exchange-rate-cron',
    '15 12,15,18,21 * * *',
    $$
      SELECT net.http_post(
        url := 'https://okpxxlpvqotwijisksui.supabase.co/functions/v1/update-exchange-rate',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $$
  );
END $DO$;
