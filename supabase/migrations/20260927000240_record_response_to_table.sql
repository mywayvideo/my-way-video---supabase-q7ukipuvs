CREATE TABLE IF NOT EXISTS public._tmp_indexing_log (
    id SERIAL PRIMARY KEY,
    info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
DECLARE
  v_rec RECORD;
  v_count BIGINT;
BEGIN
  SELECT count(*) FILTER (WHERE embedding IS NOT NULL) INTO v_count FROM public.imp_sim_ncm_embeddings;
  
  SELECT id, status_code, content, error_msg 
  INTO v_rec
  FROM net._http_response 
  ORDER BY id DESC 
  LIMIT 1;

  INSERT INTO public._tmp_indexing_log (info)
  VALUES (format('Embeddings=%s | Last HTTP ID=%s status=%s content=%s err=%s', 
    v_count, v_rec.id, v_rec.status_code, v_rec.content, v_rec.error_msg));
END $$;
