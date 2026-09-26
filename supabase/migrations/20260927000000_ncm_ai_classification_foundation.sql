-- Fase 1: Fundação de Dados para Classificação NCM por IA
-- 1. Habilitar extensão pgvector
-- 2. Tabela imp_sim_ncm_embeddings
-- 3. Tabela imp_sim_ncm_classification_log
-- 4. Funções RPC de indexação e sincronização
-- 5. RPC search_ncm_candidates com busca híbrida (vetorial + pg_trgm + FTS)

-- 1. Habilitar pgvector e pg_trgm
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- 2. Tabela de embeddings NCM
-- Suporta embeddings de dimensão 1536 (padrão OpenAI text-embedding-3-small)
CREATE TABLE IF NOT EXISTS public.imp_sim_ncm_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_rate_id UUID REFERENCES public.imp_sim_tax_rates(id) ON DELETE CASCADE,
    ncm TEXT NOT NULL,
    ex TEXT NOT NULL DEFAULT '',
    source_text TEXT NOT NULL,
    embedding public.vector(1536),
    embedding_model TEXT DEFAULT 'text-embedding-3-small',
    source_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_imp_sim_ncm_embeddings_ncm_ex UNIQUE (ncm, ex)
);

-- Índices para imp_sim_ncm_embeddings
CREATE INDEX IF NOT EXISTS idx_imp_sim_ncm_embeddings_ncm ON public.imp_sim_ncm_embeddings(ncm);
CREATE INDEX IF NOT EXISTS idx_imp_sim_ncm_embeddings_tax_rate_id ON public.imp_sim_ncm_embeddings(tax_rate_id);
CREATE INDEX IF NOT EXISTS idx_imp_sim_ncm_embeddings_source_text_trgm ON public.imp_sim_ncm_embeddings USING gin (source_text gin_trgm_ops);

-- Índice HNSW para busca vetorial de cosseno (<=>)
-- Criamos condicionalmente se houver pgvector disponível
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'imp_sim_ncm_embeddings' 
          AND indexname = 'idx_imp_sim_ncm_embeddings_vector_hnsw'
    ) THEN
        CREATE INDEX idx_imp_sim_ncm_embeddings_vector_hnsw 
        ON public.imp_sim_ncm_embeddings 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Não foi possível criar índice HNSW imediatamente (pode necessitar dados ou vector): %', SQLERRM;
END $$;

-- 3. Tabela de logs de classificação por IA
CREATE TABLE IF NOT EXISTS public.imp_sim_ncm_classification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    input_description TEXT NOT NULL,
    agent_suggestion JSONB NOT NULL DEFAULT '{}'::jsonb,
    final_choice_ncm TEXT,
    final_choice_ex TEXT,
    confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito', 'rejeitado', 'manual')),
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    imp_sim_product_id UUID REFERENCES public.imp_sim_products(id) ON DELETE SET NULL,
    audit_links JSONB DEFAULT '[]'::jsonb,
    knowledge_base_version TEXT DEFAULT '1.0',
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imp_sim_ncm_log_user ON public.imp_sim_ncm_classification_log(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_imp_sim_ncm_log_status ON public.imp_sim_ncm_classification_log(status);
CREATE INDEX IF NOT EXISTS idx_imp_sim_ncm_log_ncm ON public.imp_sim_ncm_classification_log(final_choice_ncm);
CREATE INDEX IF NOT EXISTS idx_imp_sim_ncm_log_created ON public.imp_sim_ncm_classification_log(created_at DESC);

-- RLS para imp_sim_ncm_embeddings
ALTER TABLE public.imp_sim_ncm_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_imp_sim_ncm_embeddings" ON public.imp_sim_ncm_embeddings;
CREATE POLICY "authenticated_select_imp_sim_ncm_embeddings" ON public.imp_sim_ncm_embeddings
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_imp_sim_ncm_embeddings" ON public.imp_sim_ncm_embeddings;
CREATE POLICY "authenticated_insert_imp_sim_ncm_embeddings" ON public.imp_sim_ncm_embeddings
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_imp_sim_ncm_embeddings" ON public.imp_sim_ncm_embeddings;
CREATE POLICY "authenticated_update_imp_sim_ncm_embeddings" ON public.imp_sim_ncm_embeddings
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_imp_sim_ncm_embeddings" ON public.imp_sim_ncm_embeddings;
CREATE POLICY "authenticated_delete_imp_sim_ncm_embeddings" ON public.imp_sim_ncm_embeddings
    FOR DELETE TO authenticated USING (true);

-- RLS para imp_sim_ncm_classification_log
ALTER TABLE public.imp_sim_ncm_classification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_own_or_admin_imp_sim_ncm_classification_log" ON public.imp_sim_ncm_classification_log;
CREATE POLICY "authenticated_select_own_or_admin_imp_sim_ncm_classification_log" ON public.imp_sim_ncm_classification_log
    FOR SELECT TO authenticated
    USING (
        confirmed_by = auth.uid() OR 
        (SELECT public.check_is_admin()) = true
    );

DROP POLICY IF EXISTS "authenticated_insert_own_imp_sim_ncm_classification_log" ON public.imp_sim_ncm_classification_log;
CREATE POLICY "authenticated_insert_own_imp_sim_ncm_classification_log" ON public.imp_sim_ncm_classification_log
    FOR INSERT TO authenticated
    WITH CHECK (
        confirmed_by IS NULL OR 
        confirmed_by = auth.uid() OR 
        (SELECT public.check_is_admin()) = true
    );

DROP POLICY IF EXISTS "authenticated_update_own_or_admin_imp_sim_ncm_classification_log" ON public.imp_sim_ncm_classification_log;
CREATE POLICY "authenticated_update_own_or_admin_imp_sim_ncm_classification_log" ON public.imp_sim_ncm_classification_log
    FOR UPDATE TO authenticated
    USING (
        confirmed_by = auth.uid() OR 
        (SELECT public.check_is_admin()) = true
    )
    WITH CHECK (
        confirmed_by = auth.uid() OR 
        (SELECT public.check_is_admin()) = true
    );

DROP POLICY IF EXISTS "admin_delete_imp_sim_ncm_classification_log" ON public.imp_sim_ncm_classification_log;
CREATE POLICY "admin_delete_imp_sim_ncm_classification_log" ON public.imp_sim_ncm_classification_log
    FOR DELETE TO authenticated
    USING ((SELECT public.check_is_admin()) = true);

-- 4. Função auxiliar de formato de source_text
CREATE OR REPLACE FUNCTION public.imp_sim_format_ncm_source_text(
    p_ncm TEXT,
    p_ex TEXT,
    p_ncm_desc TEXT,
    p_ex_desc TEXT
) RETURNS TEXT AS $$
BEGIN
    RETURN trim(concat_ws(
        ' | ',
        concat('NCM ', COALESCE(NULLIF(p_ncm, ''), 'S/N')),
        CASE WHEN p_ex IS NOT NULL AND p_ex <> '' THEN concat('Ex ', p_ex) ELSE NULL END,
        NULLIF(trim(p_ncm_desc), ''),
        NULLIF(trim(p_ex_desc), '')
    ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Função RPC para registrar / inicializar registros de embeddings a partir de imp_sim_tax_rates
CREATE OR REPLACE FUNCTION public.sync_imp_sim_ncm_embedding_records()
RETURNS TABLE(
    total_tax_rates BIGINT,
    total_embeddings BIGINT,
    inserted_count BIGINT,
    updated_count BIGINT
) AS $$
DECLARE
    v_total_tax_rates BIGINT := 0;
    v_total_embeddings BIGINT := 0;
    v_inserted BIGINT := 0;
    v_updated BIGINT := 0;
BEGIN
    SELECT count(*) INTO v_total_tax_rates FROM public.imp_sim_tax_rates;

    -- Upsert registros na tabela de embeddings (preenche tax_rate_id, ncm, ex, source_text, source_hash)
    WITH source_data AS (
        SELECT 
            t.id AS tax_rate_id,
            t.ncm,
            COALESCE(t.ex, '') AS ex,
            public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao) AS source_text,
            md5(public.imp_sim_format_ncm_source_text(t.ncm, t.ex, t.ncm_descricao, t.ex_descricao)) AS source_hash
        FROM public.imp_sim_tax_rates t
        WHERE t.ncm IS NOT NULL AND t.ncm <> ''
    ),
    upserted AS (
        INSERT INTO public.imp_sim_ncm_embeddings (
            tax_rate_id,
            ncm,
            ex,
            source_text,
            source_hash,
            updated_at
        )
        SELECT 
            tax_rate_id,
            ncm,
            ex,
            source_text,
            source_hash,
            NOW()
        FROM source_data
        ON CONFLICT (ncm, ex) DO UPDATE SET
            tax_rate_id = EXCLUDED.tax_rate_id,
            source_text = EXCLUDED.source_text,
            source_hash = EXCLUDED.source_hash,
            updated_at = NOW()
        WHERE imp_sim_ncm_embeddings.source_hash IS DISTINCT FROM EXCLUDED.source_hash
           OR imp_sim_ncm_embeddings.tax_rate_id IS DISTINCT FROM EXCLUDED.tax_rate_id
        RETURNING (xmax = 0) AS is_insert
    )
    SELECT 
        count(*) FILTER (WHERE is_insert),
        count(*) FILTER (WHERE NOT is_insert)
    INTO v_inserted, v_updated
    FROM upserted;

    SELECT count(*) INTO v_total_embeddings FROM public.imp_sim_ncm_embeddings;

    RETURN QUERY SELECT v_total_tax_rates, v_total_embeddings, v_inserted, v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger para manter imp_sim_ncm_embeddings sincronizado quando imp_sim_tax_rates mudar
CREATE OR REPLACE FUNCTION public.trigger_sync_tax_rate_embedding()
RETURNS TRIGGER AS $$
DECLARE
    v_source_text TEXT;
    v_hash TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.imp_sim_ncm_embeddings
        WHERE ncm = OLD.ncm AND ex = COALESCE(OLD.ex, '');
        RETURN OLD;
    END IF;

    v_source_text := public.imp_sim_format_ncm_source_text(NEW.ncm, NEW.ex, NEW.ncm_descricao, NEW.ex_descricao);
    v_hash := md5(v_source_text);

    INSERT INTO public.imp_sim_ncm_embeddings (
        tax_rate_id,
        ncm,
        ex,
        source_text,
        source_hash,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.ncm,
        COALESCE(NEW.ex, ''),
        v_source_text,
        v_hash,
        NOW()
    )
    ON CONFLICT (ncm, ex) DO UPDATE SET
        tax_rate_id = EXCLUDED.tax_rate_id,
        source_text = EXCLUDED.source_text,
        source_hash = EXCLUDED.source_hash,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_imp_sim_ncm_embeddings ON public.imp_sim_tax_rates;
CREATE TRIGGER trg_sync_imp_sim_ncm_embeddings
    AFTER INSERT OR UPDATE OR DELETE ON public.imp_sim_tax_rates
    FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_tax_rate_embedding();

-- 7. Função RPC para upsert de batch de vetores
-- Usada pela rotina externa / edge function quando gerar embeddings
CREATE OR REPLACE FUNCTION public.upsert_ncm_embeddings_batch(
    records JSONB,
    p_model TEXT DEFAULT 'text-embedding-3-small'
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    WITH incoming AS (
        SELECT 
            elem->>'ncm' AS ncm,
            COALESCE(elem->>'ex', '') AS ex,
            elem->>'source_text' AS source_text,
            (elem->>'embedding')::public.vector(1536) AS embedding
        FROM jsonb_array_elements(records) AS elem
    )
    UPDATE public.imp_sim_ncm_embeddings e
    SET 
        embedding = i.embedding,
        embedding_model = p_model,
        updated_at = NOW()
    FROM incoming i
    WHERE e.ncm = i.ncm AND e.ex = i.ex;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Função RPC de Busca Híbrida: search_ncm_candidates
-- Aceita query em texto (obrigatório), vetor opcional de embedding (query_embedding), e top_n (default 15)
-- Funciona perfeitamente:
--   a) Híbrida completa (se query_embedding for fornecido): combina similaridade de cosseno com trigramas/FTS
--   b) Fallback textual robusto (se query_embedding for NULL ou tabela sem vetor): usa trigram similarity + full-text search ponderado
-- Busca em TODA a tabela imp_sim_tax_rates (capítulos 84, 85, 90 e todos os outros, sem qualquer filtro de capítulo)
CREATE OR REPLACE FUNCTION public.search_ncm_candidates(
    query TEXT,
    query_embedding public.vector(1536) DEFAULT NULL,
    top_n INTEGER DEFAULT 15,
    match_threshold NUMERIC DEFAULT 0.05
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
        -- BUSCA HÍBRIDA (Vetorial + Textual Trigram + Código NCM)
        RETURN QUERY
        WITH vector_candidates AS (
            SELECT 
                e.tax_rate_id,
                e.ncm,
                e.ex,
                e.source_text,
                -- 1 - cosine distance = similaridade de cosseno [-1, 1], normalizada para [0, 1]
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
                    -- Trigram similarity sobre texto completo
                    (similarity(e.source_text, clean_query) * 0.7) +
                    -- Bônus se houver match direto do código NCM (ex.: digitou 84 ou 8525)
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
                (length(q_ncm_code) >= 2 AND e.ncm LIKE (q_ncm_code || '%'))
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
                -- Peso 65% vetorial + 35% textual
                (
                    (COALESCE(vc.v_score, 0.0::numeric) * 0.65) + 
                    (COALESCE(tc.t_score, similarity(COALESCE(vc.source_text, ''), clean_query)::numeric) * 0.35)
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
        -- FALLBACK TEXTUAL HÍBRIDO (Trigram + ILIKE + Prefix NCM + Word Matches)
        -- Usado quando query_embedding não é passado ou na ausência de embedding pré-gerado
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
                    ) * 0.6) +
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
                -- busca por palavras separadas (tokens)
                EXISTS (
                    SELECT 1 
                    FROM unnest(string_to_array(clean_query, ' ')) token 
                    WHERE length(token) >= 3 AND (
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

-- Conceder permissões para authenticated e service_role
GRANT SELECT ON public.imp_sim_ncm_embeddings TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.imp_sim_ncm_embeddings TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_sim_ncm_classification_log TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.search_ncm_candidates(TEXT, public.vector, INTEGER, NUMERIC) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.sync_imp_sim_ncm_embedding_records() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_ncm_embeddings_batch(JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.imp_sim_format_ncm_source_text(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role, anon;
