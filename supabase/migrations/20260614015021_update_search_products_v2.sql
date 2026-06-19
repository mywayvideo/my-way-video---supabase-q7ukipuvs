CREATE EXTENSION IF NOT EXISTS unaccent;

-- Drop existing function to recreate it with the correct return type
DROP FUNCTION IF EXISTS public.search_products_v2(text);
DROP FUNCTION IF EXISTS public.search_products_v2(character varying);

CREATE OR REPLACE FUNCTION public.search_products_v2(search_term text)
RETURNS SETOF public.products
LANGUAGE plpgsql
AS $function$
DECLARE
    clean_query text;
    search_terms text[];
    term text;
    tsquery_string text := '';
    or_tsquery_string text := '';
BEGIN
    -- Handle empty or whitespace-only queries
    IF trim(search_term) = '' OR search_term IS NULL THEN
        RETURN;
    END IF;

    -- Clean query: remove special chars, lowercase, unaccent
    clean_query := unaccent(lower(search_term));
    
    -- Tokenize and filter stop words
    search_terms := regexp_split_to_array(clean_query, '\s+');
    
    -- Build query string
    FOR i IN 1..array_length(search_terms, 1) LOOP
        term := search_terms[i];
        
        -- Filter stop words
        IF term NOT IN ('de', 'para', 'com', 'o', 'a', 'for', 'with', 'by', 'and', 'e', 'do', 'da', 'dos', 'das', 'em', 'no', 'na') AND length(term) >= 1 THEN
            IF tsquery_string != '' THEN
                tsquery_string := tsquery_string || ' & ';
                or_tsquery_string := or_tsquery_string || ' | ';
            END IF;
            tsquery_string := tsquery_string || term || ':*';
            or_tsquery_string := or_tsquery_string || term || ':*';
        END IF;
    END LOOP;

    -- If no valid terms left, return empty
    IF or_tsquery_string = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH ranked_products AS (
        SELECT 
            p.id,
            -- Calculate relevance base (OR logic)
            ts_rank_cd(
                setweight(to_tsvector('simple', unaccent(coalesce(p.name, ''))), 'A') ||
                setweight(to_tsvector('simple', unaccent(coalesce(m.name, ''))), 'B') ||
                setweight(to_tsvector('simple', unaccent(coalesce(p.description, ''))), 'C'),
                to_tsquery('simple', or_tsquery_string)
            ) AS base_rank,
            -- Bonus for matching all terms (AND logic)
            ts_rank_cd(
                setweight(to_tsvector('simple', unaccent(coalesce(p.name, ''))), 'A') ||
                setweight(to_tsvector('simple', unaccent(coalesce(m.name, ''))), 'B') ||
                setweight(to_tsvector('simple', unaccent(coalesce(p.description, ''))), 'C'),
                to_tsquery('simple', tsquery_string)
            ) AS exact_match_bonus
        FROM public.products p
        LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
        WHERE 
            to_tsvector('simple', unaccent(coalesce(p.name, ''))) ||
            to_tsvector('simple', unaccent(coalesce(m.name, ''))) ||
            to_tsvector('simple', unaccent(coalesce(p.description, ''))) @@ to_tsquery('simple', or_tsquery_string)
            AND p.status = 'active'
    )
    SELECT p.*
    FROM public.products p
    JOIN ranked_products rp ON p.id = rp.id
    WHERE rp.base_rank > 0
    ORDER BY (rp.base_rank + (rp.exact_match_bonus * 2.0)) DESC
    LIMIT 40;
END;
$function$;
