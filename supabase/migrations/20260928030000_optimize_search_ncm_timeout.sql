-- Migration: Otimização de busca e mitigação definitiva de statement_timeout para classificação fiscal NCM
-- Adiciona índices para suporte a busca por partes e prefixos de 6 dígitos
-- Atualiza a função search_ncm_candidates com SET statement_timeout = '25000' em nível de função

-- 1. Índice para acelerar expansão hierárquica por prefixo de 6 dígitos em imp_sim_tax_rates
CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_ncm_prefix6 
ON public.imp_sim_tax_rates USING btree (SUBSTRING(ncm FROM 1 FOR 6));

-- 2. Índice composto para aceleração de lookup direto por ncm e ex
CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_ncm_ex_lookup 
ON public.imp_sim_tax_rates USING btree (ncm, COALESCE(ex, ''));

-- 3. Atualizar search_ncm_candidates garantindo SET statement_timeout = '25000' como parâmetro de função
-- (isso sobrepõe o statement_timeout=8s herdado pelo PostgREST/authenticator antes da execução de queries)
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
SET statement_timeout = '25000'
AS $function$
DECLARE
    clean_query TEXT;
    q_ncm_code TEXT;
    has_vector_search BOOLEAN := false;
    extracted_tokens TEXT[];
BEGIN
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
                    (similarity(e.source_text, clean_query) * 0.6) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 0 AND e.source_text ILIKE ('%' || extracted_tokens[1] || '%') THEN 0.20
                        ELSE 0.0
                    END) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 1 AND e.source_text ILIKE ('%' || extracted_tokens[2] || '%') THEN 0.15
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
                clean_query % e.source_text OR
                (length(q_ncm_code) >= 2 AND e.ncm LIKE (q_ncm_code || '%')) OR
                (cardinality(extracted_tokens) > 0 AND e.source_text ILIKE ('%' || extracted_tokens[1] || '%'))
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
                COALESCE(tc.t_score, similarity(COALESCE(vc.source_text, ''), clean_query)::numeric) AS t_score,
                (
                    (COALESCE(vc.v_score, 0.0::numeric) * 0.60) + 
                    (COALESCE(tc.t_score, similarity(COALESCE(vc.source_text, ''), clean_query)::numeric) * 0.40)
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
        -- FALLBACK TEXTUAL OTIMIZADO (Trigram + Token Matches + Prefix NCM sobre ncm_descricao_full e ncm_descricao)
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
                    (similarity(
                        public.imp_sim_format_ncm_source_text(
                            t.ncm, 
                            t.ex, 
                            COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao), 
                            t.ex_descricao, 
                            t.ipi_ex_descricao
                        ), 
                        clean_query
                    ) * 0.5) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 0 AND (
                            COALESCE(t.ncm_descricao_full, t.ncm_descricao) ILIKE ('%' || extracted_tokens[1] || '%') OR 
                            t.ex_descricao ILIKE ('%' || extracted_tokens[1] || '%')
                        ) THEN 0.20
                        ELSE 0.0
                    END) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 1 AND (
                            COALESCE(t.ncm_descricao_full, t.ncm_descricao) ILIKE ('%' || extracted_tokens[2] || '%') OR 
                            t.ex_descricao ILIKE ('%' || extracted_tokens[2] || '%')
                        ) THEN 0.15
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
                (clean_query % COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao)) OR
                (clean_query % t.ncm_descricao) OR
                (clean_query % t.ex_descricao) OR
                (cardinality(extracted_tokens) > 0 AND (
                    COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao) ILIKE ('%' || extracted_tokens[1] || '%') OR 
                    t.ex_descricao ILIKE ('%' || extracted_tokens[1] || '%')
                ))
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
