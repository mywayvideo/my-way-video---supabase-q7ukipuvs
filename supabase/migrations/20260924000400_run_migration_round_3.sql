-- Run third pass migration for remaining products
DO $$
DECLARE
  v_service_role_key TEXT;
  v_batch_size INT := 80;
  v_offset INT := 0;
  v_req_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_role_key IS NOT NULL AND v_service_role_key <> '' THEN
    FOR i IN 0..8 LOOP
      v_offset := i * v_batch_size;
      BEGIN
        SELECT net.http_post(
          url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/migrate-product-images?limit=' || v_batch_size || '&offset=' || v_offset,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          ),
          body := '{}'::jsonb
        ) INTO v_req_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;
END $$;
