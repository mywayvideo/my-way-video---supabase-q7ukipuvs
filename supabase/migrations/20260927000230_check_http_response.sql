DO $$
DECLARE
  v_rec RECORD;
BEGIN
  -- Aguarda 4 segundos para pg_net processar
  PERFORM pg_sleep(4);

  SELECT id, status_code, content, error_msg 
  INTO v_rec
  FROM net._http_response 
  ORDER BY id DESC 
  LIMIT 1;

  RAISE NOTICE 'pg_net response ID=% status=% content=% err=%', 
    v_rec.id, v_rec.status_code, v_rec.content, v_rec.error_msg;
END $$;
