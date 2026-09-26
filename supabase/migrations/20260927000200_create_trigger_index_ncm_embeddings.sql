CREATE OR REPLACE FUNCTION public.trigger_index_ncm_embeddings(
    p_action text DEFAULT 'index',
    p_limit int DEFAULT 2048,
    p_batch_size int DEFAULT 512
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_service_role_key TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    RAISE EXCEPTION 'SUPABASE_SERVICE_ROLE_KEY not found in vault';
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
    )
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_index_ncm_embeddings(text, int, int) TO authenticated, service_role, anon;
