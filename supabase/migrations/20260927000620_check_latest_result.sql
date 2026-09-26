DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT status_code, substring(response_body from 1 for 400) as snippet, error_msg
  INTO r
  FROM public._test_classify_ncm_result
  ORDER BY created_at DESC
  LIMIT 1;

  RAISE NOTICE 'Latest result: status=%, snippet=%, err=%', r.status_code, r.snippet, r.error_msg;
END $$;
