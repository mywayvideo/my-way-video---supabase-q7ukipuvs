-- Test classify-ncm endpoint with real Sony BURANO product
DO $$
DECLARE
  v_url TEXT := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/classify-ncm';
  v_anon_key TEXT;
  v_user_jwt TEXT;
  v_req_id BIGINT;
  v_user_id UUID;
  v_header JSONB;
  v_body JSONB;
  v_secret TEXT;
BEGIN
  -- We obtain service_role key to generate or sign a JWT, or we can use the anon key if we simulate user
  -- Or let's see how pg_net triggers classify-ncm
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;
  
  -- Create a log or execute HTTP post via pg_net
  -- Also let's check trigger_index_ncm_embeddings
  v_req_id := net.http_post(
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/index-ncm-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object(
      'action', 'index',
      'limit', 800,
      'batchSize', 100
    )
  );
  RAISE NOTICE 'Dispatched index batch: %', v_req_id;
END $$;
