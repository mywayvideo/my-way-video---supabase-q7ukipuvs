DO $$
DECLARE
  v_rec_id BIGINT;
  r RECORD;
  v_ncm TEXT;
  v_ex TEXT;
  v_ii NUMERIC;
  v_ipi NUMERIC;
  v_pis NUMERIC;
  v_cofins NUMERIC;
  v_total NUMERIC;
  v_conf TEXT;
  v_audit UUID;
  v_log_exists BOOLEAN;
  v_model TEXT;
BEGIN
  PERFORM pg_sleep(5);
  SELECT req_id INTO v_rec_id FROM public._test_classify_ncm_result WHERE response_body = 'BURANO_REQUEST_2' ORDER BY created_at DESC LIMIT 1;
  SELECT status_code, content, error_msg INTO r FROM net._http_response WHERE id = v_rec_id;

  IF r.status_code = 200 THEN
    v_ncm := (r.content::jsonb)->'recommendation'->>'ncm';
    v_ex := (r.content::jsonb)->'recommendation'->>'ex';
    v_ii := ((r.content::jsonb)->'recommendation'->>'ii')::numeric;
    v_ipi := ((r.content::jsonb)->'recommendation'->>'ipi')::numeric;
    v_pis := ((r.content::jsonb)->'recommendation'->>'pis')::numeric;
    v_cofins := ((r.content::jsonb)->'recommendation'->>'cofins')::numeric;
    v_total := ((r.content::jsonb)->'recommendation'->>'total_tax')::numeric;
    v_conf := (r.content::jsonb)->>'confidence';
    v_model := (r.content::jsonb)->>'model_used';
    v_audit := ((r.content::jsonb)->>'audit_id')::uuid;

    SELECT EXISTS (SELECT 1 FROM public.imp_sim_ncm_classification_log WHERE id = v_audit) INTO v_log_exists;

    RAISE NOTICE '>>> TEST RESULT SONY BURANO 8K <<<';
    RAISE NOTICE 'Status: 200 OK | Model: %', v_model;
    RAISE NOTICE 'Recommended NCM: % | Ex: %', v_ncm, v_ex;
    RAISE NOTICE 'Taxes: II=% | IPI=% | PIS=% | COFINS=% | Total=%', v_ii, v_ipi, v_pis, v_cofins, v_total;
    RAISE NOTICE 'Confidence: % | Audit ID: % (Logged in DB: %)', v_conf, v_audit, v_log_exists;
  ELSE
    RAISE NOTICE 'Wait 5s... status=%, content=%', r.status_code, r.content;
  END IF;
END $$;
