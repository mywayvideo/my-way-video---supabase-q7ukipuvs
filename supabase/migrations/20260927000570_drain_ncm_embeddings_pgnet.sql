-- Drain batch of NCM embeddings via pg_net async invocation
DO $$
DECLARE
  v_req_id BIGINT;
BEGIN
  v_req_id := public.trigger_index_ncm_embeddings('index', 500, 100);
  RAISE NOTICE 'Dispatched drain batch 1: request_id = %', v_req_id;
  PERFORM pg_sleep(3);
  v_req_id := public.trigger_index_ncm_embeddings('index', 500, 100);
  RAISE NOTICE 'Dispatched drain batch 2: request_id = %', v_req_id;
  PERFORM pg_sleep(3);
  v_req_id := public.trigger_index_ncm_embeddings('index', 500, 100);
  RAISE NOTICE 'Dispatched drain batch 3: request_id = %', v_req_id;
END $$;
