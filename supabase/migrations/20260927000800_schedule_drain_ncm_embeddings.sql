-- Agendamento da drenagem contínua de embeddings NCM
-- Utiliza pg_cron chamando trigger_index_ncm_embeddings a cada 5 minutos
-- Processa 100 itens por lote com timeout de 30s
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Remover agendamento anterior se houver
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-ncm-embeddings-cron') THEN
    PERFORM cron.unschedule('drain-ncm-embeddings-cron');
  END IF;
END $$;

DO $$
BEGIN
  -- Dispara a cada 5 minutos
  PERFORM cron.schedule(
    'drain-ncm-embeddings-cron',
    '*/5 * * * *',
    'SELECT public.trigger_index_ncm_embeddings(''index'', 100, 50)'
  );
END $$;

-- Executar um disparo imediato para reativar neste exato momento
DO $$
DECLARE
  v_id BIGINT;
BEGIN
  v_id := public.trigger_index_ncm_embeddings('index', 100, 50);
  RAISE NOTICE 'Rotina de drenagem NCM reativada. Disparo imediato id: %', v_id;
END $$;
