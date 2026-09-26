-- Test web search trigger with insufficient product info
DO $$
DECLARE
  v_secret TEXT;
  v_req_id BIGINT;
  v_body JSONB;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  -- Produto com descrição curta e sem specs técnicas (gatilho condicional de insuficiência dispara busca web)
  v_body := jsonb_build_object(
    'product_description', 'conversor de sinal',
    'brand', '',
    'model', '',
    'top_n', 10,
    'save_log', true
  );

  SELECT net.http_post(
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/classify-ncm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := v_body,
    timeout_milliseconds := 35000
  ) INTO v_req_id;

  INSERT INTO public._test_classify_ncm_result (req_id, response_body)
  VALUES (v_req_id, 'INSUFFICIENT_TEST');
END $$;
