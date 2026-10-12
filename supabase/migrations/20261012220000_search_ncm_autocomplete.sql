-- Migration: 20261012220000_search_ncm_autocomplete.sql
-- Propósito: Autocomplete leve, de alta performance e em query única para NCM em cadastro de produtos.
-- SEM embeddings, sem chamadas externas a IA, com busca combinada por código (prefixo)
-- e por descrição (trigram + unaccent), com ranking no servidor e deduplicação por NCM.

-- 1. Função auxiliar imutável para remoção de acentos e caixa baixa (independente de extensão unaccent)
CREATE OR REPLACE FUNCTION public.imp_sim_unaccent(val text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT translate(
    lower(val),
    'áàâãäåāæéèêëēėęíìîïīįıóòôõöøōœúùûüūųçñýÿžźż',
    'aaaaaaaeEEEEEEEiiiiiiiooooooooeuuuuuucnyyzzz'
  );
$$;

-- 2. Índice GIN trigram sobre a descrição normalizada (unaccent + lower) para busca ultrarrápida
CREATE INDEX IF NOT EXISTS idx_imp_sim_tax_rates_desc_full_unaccent_trgm
ON public.imp_sim_tax_rates
USING gin (public.imp_sim_unaccent(ncm_descricao_full) gin_trgm_ops);

-- 3. Função RPC search_ncm_autocomplete
CREATE OR REPLACE FUNCTION public.search_ncm_autocomplete(
    query text,
    "limit" integer DEFAULT 15
)
RETURNS TABLE(
    ncm text,
    ncm_descricao_full text,
    ii_rate numeric,
    ipi_rate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    clean_q text;
    q_digits text;
    norm_q text;
    tok_arr text[];
    first_tok text := '';
    stem_tok text := '';
    second_tok text := '';
    v_limit integer;
BEGIN
    clean_q := trim(query);
    IF clean_q = '' THEN
        RETURN;
    END IF;

    v_limit := LEAST(GREATEST(COALESCE("limit", 15), 1), 50);
    q_digits := regexp_replace(clean_q, '\D', '', 'g');
    norm_q := public.imp_sim_unaccent(clean_q);

    -- Extração de tokens de texto significativos
    tok_arr := ARRAY(
        SELECT tok
        FROM unnest(regexp_split_to_array(norm_q, '[\s,;./-]+')) AS tok
        WHERE length(tok) >= 2
        LIMIT 3
    );

    IF array_length(tok_arr, 1) >= 1 THEN
        first_tok := tok_arr[1];
        IF length(first_tok) >= 4 AND first_tok LIKE '%s' THEN
            stem_tok := left(first_tok, length(first_tok) - 1);
        ELSE
            stem_tok := first_tok;
        END IF;
    END IF;

    IF array_length(tok_arr, 1) >= 2 THEN
        second_tok := tok_arr[2];
    END IF;

    -- Se não houver ao menos 2 dígitos nem 2 caracteres na consulta normalizada, retorna vazio
    IF length(q_digits) < 2 AND length(norm_q) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT
            t.ncm,
            COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao, '') AS ncm_descricao_full,
            t.ii_rate,
            t.ipi_rate,
            t.ex,
            CASE
                -- 1: Código exato (8 dígitos ou código completo digitado)
                WHEN q_digits <> '' AND t.ncm = q_digits THEN 1
                -- 2: Prefixo do código NCM (ex.: "9007" casa com "90071000")
                WHEN q_digits <> '' AND length(q_digits) >= 2 AND t.ncm LIKE (q_digits || '%') THEN 2
                -- 3: Frase/texto exato dentro da descrição
                WHEN norm_q <> '' AND length(norm_q) >= 3 AND public.imp_sim_unaccent(t.ncm_descricao_full) LIKE ('%' || norm_q || '%') THEN 3
                -- 4: Token/palavra na descrição
                WHEN first_tok <> '' AND public.imp_sim_unaccent(t.ncm_descricao_full) LIKE ('%' || stem_tok || '%') THEN 4
                -- 5: Match por similaridade trigram
                ELSE 5
            END AS match_rank,
            -- Prioriza alíquota base (sem Ex-tarifário) em caso de múltiplos registros com mesmo NCM
            CASE WHEN t.ex IS NULL OR t.ex = '' THEN 0 ELSE 1 END AS ex_priority,
            -- Similaridade trigram para desempate
            CASE
                WHEN norm_q <> '' THEN similarity(public.imp_sim_unaccent(t.ncm_descricao_full), norm_q)
                ELSE 0.0
            END AS trgm_sim
        FROM public.imp_sim_tax_rates t
        WHERE
            -- (a) Match por prefixo do código NCM (ignora pontuação)
            (q_digits <> '' AND length(q_digits) >= 2 AND t.ncm LIKE (q_digits || '%'))
            OR
            -- (b) Match por palavra/token na descrição ncm_descricao_full
            (
                first_tok <> '' AND (
                    public.imp_sim_unaccent(t.ncm_descricao_full) LIKE ('%' || stem_tok || '%')
                    OR public.imp_sim_unaccent(t.ncm_descricao_full) % first_tok
                )
                AND (
                    second_tok = '' OR
                    public.imp_sim_unaccent(t.ncm_descricao_full) LIKE ('%' || second_tok || '%')
                )
            )
    ),
    deduped AS (
        SELECT DISTINCT ON (c.ncm)
            c.ncm,
            c.ncm_descricao_full,
            c.ii_rate,
            c.ipi_rate,
            c.match_rank,
            c.trgm_sim
        FROM candidates c
        ORDER BY c.ncm, c.match_rank ASC, c.ex_priority ASC, c.trgm_sim DESC
    )
    SELECT
        d.ncm,
        d.ncm_descricao_full,
        d.ii_rate,
        d.ipi_rate
    FROM deduped d
    ORDER BY
        d.match_rank ASC,
        d.trgm_sim DESC,
        d.ncm ASC
    LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_ncm_autocomplete(text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.search_ncm_autocomplete(text, integer) IS
'Autocomplete leve e rápido de NCM para cadastro/edição de produtos. SEM embeddings e sem chamadas externas. Busca combinada por código (prefixo) e descrição (trigram + unaccent).';
