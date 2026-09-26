-- Check stats of embeddings and verify drainage
DO $$
DECLARE
  v_total INT;
  v_indexed INT;
  v_pending INT;
  v_cap84 INT;
BEGIN
  SELECT count(*), count(embedding), count(*) - count(embedding)
  INTO v_total, v_indexed, v_pending
  FROM public.imp_sim_ncm_embeddings;

  SELECT count(*) INTO v_cap84 FROM public.imp_sim_ncm_embeddings WHERE ncm LIKE '84%';

  RAISE NOTICE '>>> FINAL EMBEDDING DRAIN STATS <<<';
  RAISE NOTICE 'Total: % | Indexed: % | Pending: % | Cap 84 Count: %', v_total, v_indexed, v_pending, v_cap84;
END $$;
