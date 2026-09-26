-- Wait and inspect classify-ncm response
DO $$
DECLARE
  r RECORD;
  v_rec_id BIGINT;
BEGIN
  -- Small sleep to allow edge function invocation
  PERFORM pg_sleep(8);

  SELECT req_id INTO v_rec_id FROM public._test_classify_ncm_result WHERE response_body = 'BURANO_REQUEST_2' ORDER BY created_at DESC LIMIT 1;

  SELECT status_code, content, error_msg INTO r FROM net._http_response WHERE id = v_rec_id;

  RAISE NOTICE 'BURANO CLASSIFICATION: status=%, err=%, body=%', r.status_code, r.error_msg, substring(r.content from 1 for 500);

  UPDATE public._test_classify_ncm_result
  SET status_code = r.status_code,
      response_body = r.content,
      error_msg = r.error_msg
  WHERE req_id = v_rec_id;
END $$;
