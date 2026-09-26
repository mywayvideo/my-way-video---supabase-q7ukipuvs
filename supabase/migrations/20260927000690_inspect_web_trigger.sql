-- Wait and inspect web trigger result
DO $$
DECLARE
  v_rec_id BIGINT;
  r RECORD;
  v_sufficient BOOLEAN;
  v_sources_count INT;
  v_ncm TEXT;
  v_conf TEXT;
BEGIN
  PERFORM pg_sleep(8);
  SELECT req_id INTO v_rec_id FROM public._test_classify_ncm_result WHERE response_body = 'INSUFFICIENT_TEST' ORDER BY created_at DESC LIMIT 1;
  SELECT status_code, content, error_msg INTO r FROM net._http_response WHERE id = v_rec_id;

  IF r.status_code = 200 THEN
    v_sufficient := ((r.content::jsonb)->>'sufficient_info')::boolean;
    v_sources_count := jsonb_array_length((r.content::jsonb)->'web_sources');
    v_ncm := (r.content::jsonb)->'recommendation'->>'ncm';
    v_conf := (r.content::jsonb)->>'confidence';
    RAISE NOTICE '>>> WEB TRIGGER TEST RESULT <<<';
    RAISE NOTICE 'Sufficient Info: % (expected false) | Web Sources Count: %', v_sufficient, v_sources_count;
    RAISE NOTICE 'Recommended NCM: % | Confidence: %', v_ncm, v_conf;
  ELSE
    RAISE NOTICE 'Web trigger error or still processing: status=%, err=%', r.status_code, r.error_msg;
  END IF;
END $$;
