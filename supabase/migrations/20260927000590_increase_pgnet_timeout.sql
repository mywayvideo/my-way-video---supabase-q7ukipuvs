-- Fix timeout in trigger_index_ncm_embeddings
CREATE OR REPLACE FUNCTION public.trigger_index_ncm_embeddings(p_action text DEFAULT 'index'::text, p_limit integer DEFAULT 200, p_batch_size integer DEFAULT 50)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_service_role_key TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RAISE EXCEPTION 'Chave SUPABASE_SERVICE_ROLE_KEY não localizada em vault.decrypted_secrets';
  END IF;

  SELECT net.http_post(
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/index-ncm-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'action', p_action,
      'limit', p_limit,
      'batchSize', p_batch_size
    ),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Trigger with smaller batches and 30s timeout
DO $$
DECLARE
  v_id BIGINT;
BEGIN
  v_id := public.trigger_index_ncm_embeddings('index', 100, 50);
  RAISE NOTICE 'Triggered 100 items with 30s timeout: %', v_id;
END $$;
