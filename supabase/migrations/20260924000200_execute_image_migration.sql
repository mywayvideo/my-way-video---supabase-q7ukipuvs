-- Migration: Run product images migration from external URLs to Supabase Storage
-- This uses pg_net to invoke the migrate-product-images Edge Function in chunks, or uses pg_cron/pg_net

DO $$
DECLARE
  v_service_role_key TEXT;
  v_batch_size INT := 250;
  v_offset INT := 0;
  v_req_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_role_key IS NOT NULL AND v_service_role_key <> '' THEN
    -- Trigger migration for 4 batches of 250 to cover 1000+ products
    FOR i IN 0..4 LOOP
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
        RAISE NOTICE 'Dispatched migration batch at offset % with req_id %', v_offset, v_req_id;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to dispatch batch at offset %: %', v_offset, SQLERRM;
      END;
    END LOOP;
  END IF;
END $$;
