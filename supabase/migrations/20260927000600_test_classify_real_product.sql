-- Test classify-ncm and record result to a test log table
CREATE TABLE IF NOT EXISTS public._test_classify_ncm_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  req_id BIGINT,
  status_code INT,
  response_body TEXT,
  error_msg TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
DECLARE
  v_secret TEXT;
  v_user_jwt TEXT;
  v_user_id UUID;
  v_req_id BIGINT;
  v_body JSONB;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  -- Obter usuário admin para gerar JWT válido
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'plynchusa@gmail.com' LIMIT 1;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  END IF;

  -- Montar payload de teste com produto real (Sony BURANO 8K Digital Motion Picture Camera)
  v_body := jsonb_build_object(
    'product_description', 'Sony BURANO 8K Digital Motion Picture Camera Full-Frame 8.6K 41.9MP, E/PL mount, 16 stops DR, SDI e HDMI',
    'brand', 'Sony',
    'model', 'BURANO (MPC-2610)',
    'additional_specs', 'Sensor Full-frame 8.6K 35mm, dual base ISO 800/3200, gravação X-OCN LT e XAVC H',
    'top_n', 15,
    'save_log', true
  );

  -- Note: classify-ncm takes Bearer token. In Supabase edge runtime, service_role key is also a valid JWT that auth.getUser() or jwt verification accepts, OR we can sign/pass it.
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
  VALUES (v_req_id, 'DISPATCHED_BURANO');

  -- Teste 2: Produto com descrição insuficiente para disparar busca web
  v_body := jsonb_build_object(
    'product_description', 'Aparelho conversor',
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
  VALUES (v_req_id, 'DISPATCHED_INSUFFICIENT');
END $$;
