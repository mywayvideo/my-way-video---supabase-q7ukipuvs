-- Migration: Otimização de alta performance do search_ncm_candidates e busca em imp_sim_tax_rates
-- Evita statement_timeout eliminando varredura integral de similaridade trigram em texto longo ncm_descricao_full

-- 1. Assegurar índices de suporte
CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_ncm_desc_full_trgm 
ON public.imp_sim_tax_rates USING gin (ncm_descricao_full gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_ncm_desc_trgm 
ON public.imp_sim_tax_rates USING gin (ncm_descricao gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_ex_desc_trgm 
ON public.imp_sim_tax_rates USING gin (ex_descricao gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_ncm_prefix4 
ON public.imp_sim_tax_rates (SUBSTRING(ncm FROM 1 FOR 4));

-- 2. Recriação da RPC search_ncm_candidates com proteção estrita de timeout e filtragem indexada
DROP FUNCTION IF EXISTS public.search_ncm_candidates(text, vector, integer, numeric);

CREATE OR REPLACE FUNCTION public.search_ncm_candidates(
    query text, 
    query_embedding vector DEFAULT NULL::vector, 
    top_n integer DEFAULT 15, 
    match_threshold numeric DEFAULT 0.02
)
RETURNS TABLE(
    tax_rate_id uuid, 
    ncm text, 
    ex text, 
    ncm_descricao text, 
    ncm_descricao_full text,
    ex_descricao text, 
    source_text text, 
    ii_rate numeric, 
    ipi_rate numeric, 
    pis_rate numeric, 
    cofins_rate numeric, 
    has_ex_tarifario boolean, 
    vector_score numeric, 
    text_score numeric, 
    combined_score numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
    clean_query TEXT;
    q_ncm_code TEXT;
    has_vector_search BOOLEAN := false;
    extracted_tokens TEXT[];
BEGIN
    -- Elevar temporariamente o statement_timeout nesta transação para evitar cortes prematuros
    PERFORM set_config('statement_timeout', '25000', true);

    clean_query := trim(query);
    IF clean_query = '' THEN
        RETURN;
    END IF;

    -- Extrair apenas dígitos se o usuário digitou um NCM ou parte de um NCM
    q_ncm_code := regexp_replace(clean_query, '\D', '', 'g');

    -- Extrair tokens significativos antecipadamente (evitando unnest por linha)
    SELECT COALESCE(array_agg(lower(tok)), ARRAY[]::TEXT[])
    INTO extracted_tokens
    FROM (
        SELECT DISTINCT tok
        FROM unnest(string_to_array(clean_query, ' ')) tok
        WHERE length(tok) >= 4
          AND lower(tok) NOT IN ('sony', 'with', 'para', 'from', 'system', 'camera', 'mount')
        LIMIT 5
    ) sub;

    -- Determinar se podemos rodar busca vetorial
    IF query_embedding IS NOT NULL THEN
        has_vector_search := true;
    END IF;

    IF has_vector_search THEN
        -- BUSCA HÍBRIDA EFICIENTE (HNSW Vector + Trigram GIN + Prefix NCM)
        RETURN QUERY
        WITH vector_candidates AS (
            SELECT 
                e.tax_rate_id,
                e.ncm,
                e.ex,
                e.source_text,
                GREATEST(0.0::numeric, (1.0 - (e.embedding <=> query_embedding))::numeric) AS v_score
            FROM public.imp_sim_ncm_embeddings e
            WHERE e.embedding IS NOT NULL
            ORDER BY e.embedding <=> query_embedding
            LIMIT (top_n * 4)
        ),
        text_candidates AS (
            SELECT 
                e.tax_rate_id,
                e.ncm,
                e.ex,
                e.source_text,
                (
                    (similarity(e.ncm, clean_query) * 0.4) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 0 AND e.source_text ILIKE ('%' || extracted_tokens[1] || '%') THEN 0.30
                        ELSE 0.0
                    END) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 1 AND e.source_text ILIKE ('%' || extracted_tokens[2] || '%') THEN 0.20
                        ELSE 0.0
                    END) +
                    (CASE 
                        WHEN length(q_ncm_code) >= 4 AND e.ncm = q_ncm_code THEN 0.50
                        WHEN length(q_ncm_code) >= 2 AND e.ncm LIKE (q_ncm_code || '%') THEN 0.30
                        ELSE 0.0
                    END)
                )::numeric AS t_score
            FROM public.imp_sim_ncm_embeddings e
            WHERE (
                (length(q_ncm_code) >= 2 AND e.ncm LIKE (q_ncm_code || '%')) OR
                (cardinality(extracted_tokens) > 0 AND e.source_text ILIKE ('%' || extracted_tokens[1] || '%')) OR
                (cardinality(extracted_tokens) > 1 AND e.source_text ILIKE ('%' || extracted_tokens[2] || '%'))
            )
            ORDER BY t_score DESC
            LIMIT (top_n * 4)
        ),
        all_candidate_keys AS (
            SELECT vc.ncm, vc.ex FROM vector_candidates vc
            UNION
            SELECT tc.ncm, tc.ex FROM text_candidates tc
        ),
        scored AS (
            SELECT 
                k.ncm,
                k.ex,
                COALESCE(vc.v_score, 0.0::numeric) AS v_score,
                COALESCE(tc.t_score, 0.0::numeric) AS t_score,
                (
                    (COALESCE(vc.v_score, 0.0::numeric) * 0.60) + 
                    (COALESCE(tc.t_score, 0.0::numeric) * 0.40)
                ) AS final_score
            FROM all_candidate_keys k
            LEFT JOIN vector_candidates vc ON vc.ncm = k.ncm AND vc.ex = k.ex
            LEFT JOIN text_candidates tc ON tc.ncm = k.ncm AND tc.ex = k.ex
        )
        SELECT 
            t.id AS tax_rate_id,
            t.ncm,
            COALESCE(t.ex, '') AS ex,
            t.ncm_descricao,
            COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao) AS ncm_descricao_full,
            t.ex_descricao,
            COALESCE(
                NULLIF(s_emb.source_text, ''),
                public.imp_sim_format_ncm_source_text(
                    t.ncm, 
                    t.ex, 
                    COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao), 
                    t.ex_descricao, 
                    t.ipi_ex_descricao
                )
            ) AS source_text,
            t.ii_rate,
            t.ipi_rate,
            t.pis_rate,
            t.cofins_rate,
            t.has_ex_tarifario,
            ROUND(s.v_score, 4) AS vector_score,
            ROUND(s.t_score, 4) AS text_score,
            ROUND(s.final_score, 4) AS combined_score
        FROM scored s
        JOIN public.imp_sim_tax_rates t ON t.ncm = s.ncm AND COALESCE(t.ex, '') = s.ex
        LEFT JOIN vector_candidates s_emb ON s_emb.ncm = s.ncm AND s_emb.ex = s.ex
        WHERE s.final_score >= match_threshold
        ORDER BY s.final_score DESC, t.ncm ASC, t.ex ASC
        LIMIT top_n;

    ELSE
        -- FALLBACK TEXTUAL OTIMIZADO COM ÍNDICE GIN
        -- Utiliza ILIKE indexado em vez de similaridade trigram (%) sobre 21k linhas de texto longo
        RETURN QUERY
        WITH candidates AS (
            SELECT 
                t.id AS tax_rate_id,
                t.ncm,
                COALESCE(t.ex, '') AS ex,
                t.ncm_descricao,
                COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao) AS ncm_descricao_full,
                t.ex_descricao,
                public.imp_sim_format_ncm_source_text(
                    t.ncm, 
                    t.ex, 
                    COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao), 
                    t.ex_descricao, 
                    t.ipi_ex_descricao
                ) AS source_text,
                t.ii_rate,
                t.ipi_rate,
                t.pis_rate,
                t.cofins_rate,
                t.has_ex_tarifario,
                (
                    (similarity(t.ncm_descricao, clean_query) * 0.4) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 0 AND (t.ncm_descricao_full ILIKE ('%' || extracted_tokens[1] || '%') OR t.ncm_descricao ILIKE ('%' || extracted_tokens[1] || '%') OR t.ex_descricao ILIKE ('%' || extracted_tokens[1] || '%')) THEN 0.25
                        ELSE 0.0
                    END) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 1 AND (t.ncm_descricao_full ILIKE ('%' || extracted_tokens[2] || '%') OR t.ncm_descricao ILIKE ('%' || extracted_tokens[2] || '%') OR t.ex_descricao ILIKE ('%' || extracted_tokens[2] || '%')) THEN 0.20
                        ELSE 0.0
                    END) +
                    (CASE 
                        WHEN length(q_ncm_code) >= 4 AND t.ncm = q_ncm_code THEN 0.50
                        WHEN length(q_ncm_code) >= 2 AND t.ncm LIKE (q_ncm_code || '%') THEN 0.25
                        ELSE 0.0
                    END)
                )::numeric AS t_score
            FROM public.imp_sim_tax_rates t
            WHERE 
                (length(q_ncm_code) >= 2 AND t.ncm LIKE (q_ncm_code || '%')) OR
                (cardinality(extracted_tokens) > 0 AND (t.ncm_descricao_full ILIKE ('%' || extracted_tokens[1] || '%') OR t.ncm_descricao ILIKE ('%' || extracted_tokens[1] || '%') OR t.ex_descricao ILIKE ('%' || extracted_tokens[1] || '%'))) OR
                (cardinality(extracted_tokens) > 1 AND (t.ncm_descricao_full ILIKE ('%' || extracted_tokens[2] || '%') OR t.ncm_descricao ILIKE ('%' || extracted_tokens[2] || '%') OR t.ex_descricao ILIKE ('%' || extracted_tokens[2] || '%'))) OR
                (clean_query % t.ncm_descricao)
        )
        SELECT 
            c.tax_rate_id,
            c.ncm,
            c.ex,
            c.ncm_descricao,
            c.ncm_descricao_full,
            c.ex_descricao,
            c.source_text,
            c.ii_rate,
            c.ipi_rate,
            c.pis_rate,
            c.cofins_rate,
            c.has_ex_tarifario,
            0.0::numeric AS vector_score,
            ROUND(c.t_score, 4) AS text_score,
            ROUND(c.t_score, 4) AS combined_score
        FROM candidates c
        WHERE c.t_score >= match_threshold
        ORDER BY c.t_score DESC, c.ncm ASC, c.ex ASC
        LIMIT top_n;

    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_ncm_candidates(TEXT, public.vector, INTEGER, NUMERIC) TO authenticated, service_role, anon;
