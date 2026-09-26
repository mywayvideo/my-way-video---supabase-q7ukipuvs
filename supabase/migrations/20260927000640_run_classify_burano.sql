-- Run end-to-end classify-ncm test with real product
DO $$
DECLARE
  v_secret TEXT;
  v_req_id BIGINT;
  v_body JSONB;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  -- Teste 1: Produto real Sony BURANO do catálogo
  v_body := jsonb_build_object(
    'product_description', 'Sony BURANO 8K Digital Motion Picture Camera Full-Frame 8.6K 41.9MP, E/PL mount, 16 stops DR, SDI e HDMI',
    'brand', 'Sony',
    'model', 'BURANO (MPC-2610)',
    'additional_specs', 'Sensor Full-frame 8.6K 35mm, dual base ISO 800/3200, gravação X-OCN LT e XAVC H',
    'top_n', 15,
    'save_log', true
  );

  SELECT net.http_post(
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/classify-ncm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := v_body,
    timeout_milliseconds := 30000
  ) INTO v_req_id;

  INSERT INTO public._test_classify_ncm_result (req_id, response_body)
  VALUES (v_req_id, 'BURANO_REQUEST_2');
END $$;
