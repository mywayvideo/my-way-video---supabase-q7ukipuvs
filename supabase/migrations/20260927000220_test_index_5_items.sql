-- Teste de indexação com 5 linhas
DO $$
DECLARE
  v_service_role_key TEXT;
  v_req_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_role_key IS NOT NULL AND v_service_role_key <> '' THEN
    SELECT net.http_post(
      url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/index-ncm-embeddings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := jsonb_build_object(
        'action', 'index',
        'limit', 5,
        'batchSize', 5
      )
    ) INTO v_req_id;

    RAISE NOTICE 'Disparado lote teste de 5 itens via pg_net, req_id=%', v_req_id;
  END IF;
END $$;
