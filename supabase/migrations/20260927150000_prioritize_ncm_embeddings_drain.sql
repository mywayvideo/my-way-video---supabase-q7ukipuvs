-- Priorizar drenagem dos capítulos 85 e 90 no pg_cron
-- e atualizar a função trigger_index_ncm_embeddings para aceitar p_chapter

CREATE OR REPLACE FUNCTION public.trigger_index_ncm_embeddings(
  p_action text DEFAULT 'index'::text,
  p_limit integer DEFAULT 200,
  p_batch_size integer DEFAULT 50,
  p_chapter text DEFAULT NULL
)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_service_role_key TEXT;
  v_request_id BIGINT;
  v_body JSONB;
BEGIN
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RAISE EXCEPTION 'Chave SUPABASE_SERVICE_ROLE_KEY não localizada em vault.decrypted_secrets';
  END IF;

  v_body := jsonb_build_object(
    'action', p_action,
    'limit', p_limit,
    'batchSize', p_batch_size
  );

  IF p_chapter IS NOT NULL AND trim(p_chapter) <> '' THEN
    v_body := v_body || jsonb_build_object('chapter', trim(p_chapter));
  END IF;

  SELECT net.http_post(
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/index-ncm-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := v_body,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

-- Atualizar agendamento do pg_cron para processar capítulos 85 e 90 com prioridade máxima
DO $$
BEGIN
  -- Desmarcar job anterior se existir e recriar com foco nos capítulos 85 e 90
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-ncm-embeddings-cron') THEN
    PERFORM cron.unschedule('drain-ncm-embeddings-cron');
  END IF;

  -- Disparar a cada 2 minutos (em vez de a cada 5) com lote de 400 itens por ciclo
  PERFORM cron.schedule(
    'drain-ncm-embeddings-cron',
    '*/2 * * * *',
    'SELECT public.trigger_index_ncm_embeddings(''index'', 400, 50, ''85'')'
  );

  -- Adicionar job paralelo para capítulo 90 a cada 3 minutos
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-ncm-chapter90-cron') THEN
    PERFORM cron.unschedule('drain-ncm-chapter90-cron');
  END IF;

  PERFORM cron.schedule(
    'drain-ncm-chapter90-cron',
    '*/3 * * * *',
    'SELECT public.trigger_index_ncm_embeddings(''index'', 400, 50, ''90'')'
  );
END $$;
