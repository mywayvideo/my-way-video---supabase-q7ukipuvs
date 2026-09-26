-- Collect responses from net._http_response
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT t.id, t.req_id, resp.status_code, resp.content, resp.error_msg
    FROM public._test_classify_ncm_result t
    LEFT JOIN net._http_response resp ON resp.id = t.req_id
    WHERE t.status_code IS NULL
  ) LOOP
    IF r.status_code IS NOT NULL OR r.error_msg IS NOT NULL THEN
      UPDATE public._test_classify_ncm_result
      SET status_code = r.status_code,
          response_body = r.content,
          error_msg = r.error_msg
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
