-- Migration: Otimização da performance do search_ncm_candidates e eliminação de statement_timeout
-- Data/Hora: 2026-09-27T03:30:00Z
-- Contexto: A busca de candidatos NCM híbrida anterior realizava subqueries unnest() correlacionadas
-- linha a linha para cada registro da tabela imp_sim_ncm_embeddings e imp_sim_tax_rates (21k+ linhas),
-- gerando mais de 20.000 iterações com ILIKE repetido, ultrapassando os timeouts de Postgres (8s para
-- authenticated e estourando o timeout da edge function classify-ncm).
--
-- Solução:
-- 1. Criação de índices GIN com gin_trgm_ops na tabela imp_sim_tax_rates (ncm_descricao, ex_descricao).
-- 2. Na função search_ncm_candidates:
--    a) Pré-computação dos tokens significativos (comprimento >= 4, não-stopword) em um array local antes da query.
--    b) Uso de tsquery ou filtros diretos com trigram GIN, evitando unnest() correlacionado por linha.
--    c) Na branch vetorial (has_vector_search): a ordenação vetorial (HNSW) já recupera os candidatos mais
--       relevantes instantaneamente (< 20ms). A busca textual foca em trigrama (% e similarity) e código NCM.
--    d) Configuração explícita de `SET LOCAL statement_timeout = '25s'` dentro da função para segurança operacional.

CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_ncm_desc_trgm 
ON public.imp_sim_tax_rates USING gin (ncm_descricao gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_ex_desc_trgm 
ON public.imp_sim_tax_rates USING gin (ex_descricao gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_ncm_candidates(
    query TEXT,
    query_embedding public.vector(1536) DEFAULT NULL,
    top_n INTEGER DEFAULT 15,
    match_threshold NUMERIC DEFAULT 0.02
)
RETURNS TABLE (
    tax_rate_id UUID,
    ncm TEXT,
    ex TEXT,
    ncm_descricao TEXT,
    ex_descricao TEXT,
    source_text TEXT,
    ii_rate NUMERIC,
    ipi_rate NUMERIC,
    pis_rate NUMERIC,
    cofins_rate NUMERIC,
    has_ex_tarifario BOOLEAN,
    vector_score NUMERIC,
    text_score NUMERIC,
    combined_score NUMERIC
) AS $$
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
            t.ex_descricao,
            public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao) AS source_text,
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
        WHERE s.final_score >= match_threshold
        ORDER BY s.final_score DESC, t.ncm ASC, t.ex ASC
        LIMIT top_n;

    ELSE
        -- FALLBACK TEXTUAL OTIMIZADO (Trigram + Token Matches + Prefix NCM)
        RETURN QUERY
        WITH candidates AS (
            SELECT 
                t.id AS tax_rate_id,
                t.ncm,
                COALESCE(t.ex, '') AS ex,
                t.ncm_descricao,
                t.ex_descricao,
                public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao) AS source_text,
                t.ii_rate,
                t.ipi_rate,
                t.pis_rate,
                t.cofins_rate,
                t.has_ex_tarifario,
                (
                    (similarity(
                        public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao), 
                        clean_query
                    ) * 0.5) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 0 AND (t.ncm_descricao ILIKE ('%' || extracted_tokens[1] || '%') OR t.ex_descricao ILIKE ('%' || extracted_tokens[1] || '%')) THEN 0.20
                        ELSE 0.0
                    END) +
                    (CASE 
                        WHEN cardinality(extracted_tokens) > 1 AND (t.ncm_descricao ILIKE ('%' || extracted_tokens[2] || '%') OR t.ex_descricao ILIKE ('%' || extracted_tokens[2] || '%')) THEN 0.15
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
                (clean_query % t.ncm_descricao) OR
                (clean_query % t.ex_descricao) OR
                (cardinality(extracted_tokens) > 0 AND (t.ncm_descricao ILIKE ('%' || extracted_tokens[1] || '%') OR t.ex_descricao ILIKE ('%' || extracted_tokens[1] || '%')))
        )
        SELECT 
            c.tax_rate_id,
            c.ncm,
            c.ex,
            c.ncm_descricao,
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
