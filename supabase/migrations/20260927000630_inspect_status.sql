DO $$
DECLARE
  v_count INT;
  r RECORD;
BEGIN
  SELECT count(*) INTO v_count FROM public._test_classify_ncm_result WHERE status_code IS NOT NULL;
  IF v_count = 0 THEN
    SELECT id, status_code, substring(content from 1 for 200) as c, error_msg INTO r FROM net._http_response ORDER BY id DESC LIMIT 1;
    RAISE NOTICE 'net._http_response: id=%, status=%, content=%, err=%', r.id, r.status_code, r.c, r.error_msg;
  ELSE
    SELECT status_code, substring(response_body from 1 for 250) as b INTO r FROM public._test_classify_ncm_result WHERE status_code IS NOT NULL ORDER BY created_at DESC LIMIT 1;
    RAISE NOTICE 'Found response: status=%, body=%', r.status_code, r.b;
  END IF;
END $$;
