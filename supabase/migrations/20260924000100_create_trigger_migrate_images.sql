CREATE OR REPLACE FUNCTION public.trigger_migrate_product_images(p_limit int DEFAULT 100, p_offset int DEFAULT 0)
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

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    RAISE EXCEPTION 'SUPABASE_SERVICE_ROLE_KEY not found in vault';
  END IF;

  SELECT net.http_post(
    url := 'https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/migrate-product-images?limit=' || p_limit || '&offset=' || p_offset,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;
