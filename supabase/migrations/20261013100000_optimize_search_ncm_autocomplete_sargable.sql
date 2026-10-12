-- Migration: Otimização da RPC search_ncm_autocomplete para eliminar sequential scan na busca por prefixo de código NCM
-- Preserva assinatura exata (query text, "limit" integer DEFAULT 15)
-- Utiliza predicados sargáveis que aproveitam os índices btree existentes em public.imp_sim_tax_rates:
-- 1) idx_imp_sim_tax_rates_ncm_prefix4: SUBSTRING(ncm FROM 1 FOR 4)
-- 2) idx_imp_sim_tax_rates_ncm_prefix6: SUBSTRING(ncm FROM 1 FOR 6)
-- 3) igualdade exata de ncm para código completo (8 dígitos com e sem pontuação)
-- O ramo de busca textual por descrição via trigram/unaccent permanece intocado.

DROP FUNCTION IF EXISTS public.search_ncm_autocomplete(text, integer);

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
    len_digits integer;
    formatted_8d text;
    prefix4 text;
    prefix6 text;
    v_limit integer;
    norm_q text;
    tok_arr text[];
    first_tok text := '';
    stem_tok text := '';
    second_tok text := '';
BEGIN
    clean_q := trim(query);
    IF clean_q = '' THEN
        RETURN;
    END IF;

    v_limit := LEAST(GREATEST(COALESCE("limit", 15), 1), 50);
    q_digits := regexp_replace(clean_q, '\D', '', 'g');
    len_digits := length(q_digits);

    -- RAMO 1: Busca por código NCM (quando o usuário digita ao menos 2 dígitos numéricos)
    -- Reescrevemos com predicados sargáveis para usar índices btree idx_prefix4 e idx_prefix6
    IF len_digits >= 2 THEN
        prefix4 := substring(q_digits from 1 for 4);
        prefix6 := substring(q_digits from 1 for 6);
        IF len_digits >= 8 THEN
            formatted_8d := substring(q_digits from 1 for 4) || '.' ||
                             substring(q_digits from 5 for 2) || '.' ||
                             substring(q_digits from 7 for 2);
        ELSE
            formatted_8d := NULL;
        END IF;

        RETURN QUERY
        WITH code_candidates AS (
            SELECT
                t.ncm,
                COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao, '') AS ncm_descricao_full,
                t.ii_rate,
                t.ipi_rate,
                t.ex,
                CASE
                    -- Código exato (8 dígitos)
                    WHEN len_digits >= 8 AND (t.ncm = formatted_8d OR t.ncm = q_digits) THEN 1
                    -- Prefixo 6 dígitos
                    WHEN len_digits >= 6 AND SUBSTRING(t.ncm FROM 1 FOR 6) = prefix6 THEN 2
                    -- Prefixo 4 dígitos
                    WHEN len_digits >= 4 AND SUBSTRING(t.ncm FROM 1 FOR 4) = prefix4 THEN 3
                    -- Prefixo 2 a 3 dígitos (capítulo)
                    ELSE 4
                END AS match_rank,
                CASE WHEN t.ex IS NULL OR t.ex = '' THEN 0 ELSE 1 END AS ex_priority
            FROM public.imp_sim_tax_rates t
            WHERE
                (len_digits >= 8 AND (t.ncm = formatted_8d OR t.ncm = q_digits))
                OR (len_digits >= 6 AND len_digits < 8 AND SUBSTRING(t.ncm FROM 1 FOR 6) = prefix6)
                OR (len_digits >= 4 AND len_digits < 6 AND SUBSTRING(t.ncm FROM 1 FOR 4) = prefix4)
                OR (len_digits >= 2 AND len_digits < 4
                    AND SUBSTRING(t.ncm FROM 1 FOR 4) >= rpad(q_digits, 4, '0')
                    AND SUBSTRING(t.ncm FROM 1 FOR 4) <= rpad(q_digits, 4, '9'))
        ),
        code_deduped AS (
            SELECT DISTINCT ON (c.ncm)
                c.ncm,
                c.ncm_descricao_full,
                c.ii_rate,
                c.ipi_rate,
                c.match_rank
            FROM code_candidates c
            ORDER BY c.ncm, c.match_rank ASC, c.ex_priority ASC
        )
        SELECT
            d.ncm,
            d.ncm_descricao_full,
            d.ii_rate,
            d.ipi_rate
        FROM code_deduped d
        ORDER BY
            d.match_rank ASC,
            d.ncm ASC
        LIMIT v_limit;
        RETURN;
    END IF;

    -- RAMO 2: Busca por descrição via trigram/unaccent (INTOCADO)
    norm_q := public.imp_sim_unaccent(clean_q);
    IF length(norm_q) < 2 THEN
        RETURN;
    END IF;

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

    RETURN QUERY
    WITH text_candidates AS (
        SELECT
            t.ncm,
            COALESCE(NULLIF(trim(t.ncm_descricao_full), ''), t.ncm_descricao, '') AS ncm_descricao_full,
            t.ii_rate,
            t.ipi_rate,
            t.ex,
            CASE
                WHEN norm_q <> '' AND length(norm_q) >= 3 AND public.imp_sim_unaccent(t.ncm_descricao_full) LIKE ('%' || norm_q || '%') THEN 3
                WHEN first_tok <> '' AND public.imp_sim_unaccent(t.ncm_descricao_full) LIKE ('%' || stem_tok || '%') THEN 4
                ELSE 5
            END AS match_rank,
            CASE WHEN t.ex IS NULL OR t.ex = '' THEN 0 ELSE 1 END AS ex_priority,
            similarity(public.imp_sim_unaccent(t.ncm_descricao_full), norm_q) AS trgm_sim
        FROM public.imp_sim_tax_rates t
        WHERE
            first_tok <> '' AND (
                public.imp_sim_unaccent(t.ncm_descricao_full) LIKE ('%' || stem_tok || '%')
                OR public.imp_sim_unaccent(t.ncm_descricao_full) % first_tok
            )
            AND (
                second_tok = '' OR
                public.imp_sim_unaccent(t.ncm_descricao_full) LIKE ('%' || second_tok || '%')
            )
    ),
    text_deduped AS (
        SELECT DISTINCT ON (c.ncm)
            c.ncm,
            c.ncm_descricao_full,
            c.ii_rate,
            c.ipi_rate,
            c.match_rank,
            c.trgm_sim
        FROM text_candidates c
        ORDER BY c.ncm, c.match_rank ASC, c.ex_priority ASC, c.trgm_sim DESC
    )
    SELECT
        d.ncm,
        d.ncm_descricao_full,
        d.ii_rate,
        d.ipi_rate
    FROM text_deduped d
    ORDER BY
        d.match_rank ASC,
        d.trgm_sim DESC,
        d.ncm ASC
    LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_ncm_autocomplete(text, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.search_ncm_autocomplete(text, integer) IS
'Autocomplete leve e rápido de NCM com predicados sargáveis para prefixo de código (usa idx_prefix4 e idx_prefix6) e trigram para descrição.';
