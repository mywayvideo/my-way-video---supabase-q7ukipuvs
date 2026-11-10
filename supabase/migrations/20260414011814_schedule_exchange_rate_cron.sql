CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- O job chama a função public.trigger_exchange_rate_update(), que monta a URL
-- do próprio projeto e lê a credencial em app_settings/vault. Assim este arquivo
-- não contém URL literal de projeto nem segredo, e um rebuild agenda o job correto.
DO $DO$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-exchange-rate-cron') THEN
    PERFORM cron.unschedule('update-exchange-rate-cron');
  END IF;

  PERFORM cron.schedule(
    'update-exchange-rate-cron',
    '15 12,15,18,21 * * *',
    $$SELECT public.trigger_exchange_rate_update();$$
  );
END $DO$;
