-- Test migration: invoke classify-ncm for UWP-D21/14 using net.http_post
DO $$
DECLARE
  v_secret TEXT;
  v_req_id BIGINT;
  v_body JSONB;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  v_body := jsonb_build_object(
    'product_id', '0d6f7946-c95d-4d5e-9219-edc30b31feac',
    'product_description', 'Sony UWP-D21 Camera-Mount Wireless Omni Lavalier Microphone System (UC14: 470 to 542 MHz) - Wireless Transmission: Analog UHF | RF Channels: 2772',
    'brand', 'Sony',
    'model', 'UWP-D21/14',
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
    timeout_milliseconds := 60000
  ) INTO v_req_id;

  RAISE NOTICE 'Dispatched classify-ncm for UWP-D21/14 with net.http_post req_id: %', v_req_id;
END $$;
