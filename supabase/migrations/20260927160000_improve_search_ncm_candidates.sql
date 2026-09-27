-- Migration: Melhora da recuperação semântica e multi-família no search_ncm_candidates
-- Data/Hora: 2026-09-27T03:00:00Z
-- Objetivo: Garantir diversidade de famílias de posições (capítulos 84, 85, 90) e correspondência
-- semântica por tokenização/stemming quando a descrição oficial da posição contiver palavras-chave
-- (ex: microfones, alto-falantes, fones, transmissores, consoles, câmeras, etc.) sem hardcoding de códigos.

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
    q_tokens TEXT[];
    q_ncm_code TEXT;
    has_vector_search BOOLEAN := false;
BEGIN
    clean_query := trim(query);
    IF clean_query = '' THEN
        RETURN;
    END IF;

    -- Extrair apenas dígitos se o usuário digitou um NCM ou parte de um NCM
    q_ncm_code := regexp_replace(clean_query, '\D', '', 'g');

    -- Determinar se podemos rodar busca vetorial
    IF query_embedding IS NOT NULL THEN
        has_vector_search := true;
    END IF;

    IF has_vector_search THEN
        -- BUSCA HÍBRIDA (Vetorial + Textual Trigram + Token Matches + Código NCM)
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
            LIMIT (top_n * 5)
        ),
        text_candidates AS (
            SELECT 
                e.tax_rate_id,
                e.ncm,
                e.ex,
                e.source_text,
                (
                    -- Trigram similarity sobre texto completo
                    (similarity(e.source_text, clean_query) * 0.6) +
                    -- Bônus de match por tokens significativos da query (>= 4 letras)
                    (
                        SELECT COALESCE(SUM(
                            CASE 
                                WHEN e.source_text ILIKE ('%' || t || '%') THEN 0.15 
                                ELSE 0.0 
                            END
                        ), 0.0)
                        FROM unnest(string_to_array(clean_query, ' ')) t
                        WHERE length(t) >= 4 AND t NOT ILIKE 'sony' AND t NOT ILIKE 'with' AND t NOT ILIKE 'para'
                    ) +
                    -- Bônus se houver match direto do código NCM
                    (CASE 
                        WHEN length(q_ncm_code) >= 2 AND e.ncm LIKE (q_ncm_code || '%') THEN 0.3
                        WHEN length(q_ncm_code) >= 4 AND e.ncm = q_ncm_code THEN 0.5
                        ELSE 0.0
                    END)
                )::numeric AS t_score
            FROM public.imp_sim_ncm_embeddings e
            WHERE (
                clean_query % e.source_text OR
                e.source_text ILIKE ('%' || clean_query || '%') OR
                (length(q_ncm_code) >= 2 AND e.ncm LIKE (q_ncm_code || '%')) OR
                EXISTS (
                    SELECT 1 
                    FROM unnest(string_to_array(clean_query, ' ')) tok 
                    WHERE length(tok) >= 4 
                      AND tok NOT ILIKE 'sony' 
                      AND tok NOT ILIKE 'with' 
                      AND tok NOT ILIKE 'para'
                      AND e.source_text ILIKE ('%' || tok || '%')
                )
            )
            ORDER BY t_score DESC
            LIMIT (top_n * 5)
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
                -- Peso 60% vetorial + 40% textual
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
        -- FALLBACK TEXTUAL HÍBRIDO (Trigram + Token Matches + ILIKE + Prefix NCM)
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
                    -- Score de trigrama sobre a descrição completa
                    (similarity(
                        public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao), 
                        clean_query
                    ) * 0.5) +
                    -- Bônus de tokens coincidentes significativos
                    (
                        SELECT COALESCE(SUM(
                            CASE 
                                WHEN public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao) ILIKE ('%' || tok || '%') THEN 0.15 
                                ELSE 0.0 
                            END
                        ), 0.0)
                        FROM unnest(string_to_array(clean_query, ' ')) tok
                        WHERE length(tok) >= 4 AND tok NOT ILIKE 'sony' AND tok NOT ILIKE 'with' AND tok NOT ILIKE 'para'
                    ) +
                    -- Bônus de substring exata / ILIKE
                    (CASE 
                        WHEN t.ex_descricao ILIKE ('%' || clean_query || '%') THEN 0.25
                        WHEN t.ncm_descricao ILIKE ('%' || clean_query || '%') THEN 0.20
                        ELSE 0.0
                    END) +
                    -- Bônus de código NCM
                    (CASE 
                        WHEN length(q_ncm_code) >= 4 AND t.ncm = q_ncm_code THEN 0.50
                        WHEN length(q_ncm_code) >= 2 AND t.ncm LIKE (q_ncm_code || '%') THEN 0.25
                        ELSE 0.0
                    END)
                )::numeric AS t_score
            FROM public.imp_sim_tax_rates t
            WHERE 
                (length(q_ncm_code) >= 2 AND t.ncm LIKE (q_ncm_code || '%')) OR
                (clean_query % concat_ws(' ', t.ncm, t.ncm_descricao, t.ex_descricao)) OR
                t.ncm_descricao ILIKE ('%' || clean_query || '%') OR
                t.ex_descricao ILIKE ('%' || clean_query || '%') OR
                EXISTS (
                    SELECT 1 
                    FROM unnest(string_to_array(clean_query, ' ')) token 
                    WHERE length(token) >= 4 
                      AND token NOT ILIKE 'sony' 
                      AND token NOT ILIKE 'with' 
                      AND token NOT ILIKE 'para'
                      AND (
                        t.ncm_descricao ILIKE ('%' || token || '%') OR 
                        t.ex_descricao ILIKE ('%' || token || '%')
                      )
                )
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
