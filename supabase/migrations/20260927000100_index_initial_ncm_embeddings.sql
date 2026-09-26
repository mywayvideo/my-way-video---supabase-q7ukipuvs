-- Executa a indexação inicial das 21.256 linhas de imp_sim_tax_rates em imp_sim_ncm_embeddings
DO $$
DECLARE
    v_total_before BIGINT;
    v_total_tax_rates BIGINT;
    v_total_after BIGINT;
BEGIN
    SELECT count(*) INTO v_total_tax_rates FROM public.imp_sim_tax_rates;
    SELECT count(*) INTO v_total_before FROM public.imp_sim_ncm_embeddings;

    -- Inserir / indexar todas as linhas
    INSERT INTO public.imp_sim_ncm_embeddings (
        tax_rate_id,
        ncm,
        ex,
        source_text,
        source_hash,
        updated_at
    )
    SELECT 
        t.id,
        t.ncm,
        COALESCE(t.ex, ''),
        public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao),
        md5(public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao)),
        NOW()
    FROM public.imp_sim_tax_rates t
    WHERE t.ncm IS NOT NULL AND t.ncm <> ''
    ON CONFLICT (ncm, ex) DO UPDATE SET
        tax_rate_id = EXCLUDED.tax_rate_id,
        source_text = EXCLUDED.source_text,
        source_hash = EXCLUDED.source_hash,
        updated_at = NOW()
    WHERE imp_sim_ncm_embeddings.source_hash IS DISTINCT FROM EXCLUDED.source_hash
       OR imp_sim_ncm_embeddings.tax_rate_id IS DISTINCT FROM EXCLUDED.tax_rate_id;

    SELECT count(*) INTO v_total_after FROM public.imp_sim_ncm_embeddings;

    RAISE NOTICE 'Indexação concluída: imp_sim_tax_rates=% | embeddings_antes=% | embeddings_depois=%', 
        v_total_tax_rates, v_total_before, v_total_after;
END $$;
