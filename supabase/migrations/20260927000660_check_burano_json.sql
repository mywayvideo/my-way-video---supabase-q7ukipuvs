DO $$
DECLARE
  v_rec_id BIGINT;
  r RECORD;
  v_ncm TEXT;
  v_conf TEXT;
  v_audit UUID;
BEGIN
  SELECT req_id INTO v_rec_id FROM public._test_classify_ncm_result WHERE response_body = 'BURANO_REQUEST_2' ORDER BY created_at DESC LIMIT 1;
  SELECT status_code, content, error_msg INTO r FROM net._http_response WHERE id = v_rec_id;

  IF r.status_code = 200 THEN
    v_ncm := (r.content::jsonb)->'recommendation'->>'ncm';
    v_conf := (r.content::jsonb)->>'confidence';
    v_audit := ((r.content::jsonb)->>'audit_id')::uuid;
    RAISE NOTICE 'SUCCESS! Classified NCM=%, Confidence=%, AuditID=%', v_ncm, v_conf, v_audit;
  ELSE
    RAISE NOTICE 'BURANO not ready or error: status=%, err=%, content=%', r.status_code, r.error_msg, substring(r.content from 1 for 300);
  END IF;
END $$;
