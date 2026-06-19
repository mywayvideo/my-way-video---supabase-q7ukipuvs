-- Migration for updating search_products_v2 to use OR logic, unaccent, stop words and weighted relevance
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

DROP FUNCTION IF EXISTS public.search_products_v2(text, numeric);

CREATE OR REPLACE FUNCTION public.search_products_v2(
  search_term text,
  boost_multiplier numeric DEFAULT 1.0
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  sku text,
  manufacturer text,
  category text,
  price_usd numeric,
  price_nationalized_sales numeric,
  price_nationalized_currency text,
  final_rank numeric
) AS $$
DECLARE
  clean_term text;
  term_array text[];
  stop_words text[] := ARRAY['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'por', 'the', 'an', 'for', 'with', 'by', 'and', 'e'];
  filtered_terms text[];
  word text;
  ts_query_or tsquery;
  ts_query_and tsquery;
  query_string_or text;
  query_string_and text;
BEGIN
  -- 1. Unaccent and lowercase
  clean_term := lower(public.unaccent(search_term));
  
  -- 2. Remove punctuation, replace with space
  clean_term := regexp_replace(clean_term, '[^a-z0-9\s]', ' ', 'g');
  
  -- 3. Split into array (ignoring multiple spaces)
  term_array := string_to_array(regexp_replace(trim(clean_term), '\s+', ' ', 'g'), ' ');
  
  -- 4. Filter stop words
  IF array_length(term_array, 1) > 0 THEN
    FOREACH word IN ARRAY term_array
    LOOP
      IF NOT (word = ANY(stop_words)) AND length(word) > 0 THEN
        filtered_terms := array_append(filtered_terms, word);
      END IF;
    END LOOP;
  END IF;
  
  -- If empty after filtering, fall back to original array if it had something
  IF filtered_terms IS NULL OR array_length(filtered_terms, 1) IS NULL THEN
    filtered_terms := term_array;
  END IF;
  
  IF filtered_terms IS NULL OR array_length(filtered_terms, 1) IS NULL OR filtered_terms[1] = '' THEN
    RETURN;
  END IF;
  
  -- 5. Build TS Queries
  SELECT string_agg(t || ':*', ' | ') INTO query_string_or
  FROM unnest(filtered_terms) AS t WHERE t <> '';
  
  SELECT string_agg(t || ':*', ' & ') INTO query_string_and
  FROM unnest(filtered_terms) AS t WHERE t <> '';
  
  IF query_string_or IS NULL OR query_string_or = '' THEN
    RETURN;
  END IF;
  
  ts_query_or := to_tsquery('simple', query_string_or);
  ts_query_and := to_tsquery('simple', query_string_and);

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.sku,
    m.name AS manufacturer,
    p.category,
    p.price_usd,
    p.price_nationalized_sales,
    p.price_nationalized_currency,
    -- Calculate rank
    (
      (
        ts_rank(
          setweight(to_tsvector('simple', public.unaccent(coalesce(p.name, ''))), 'A') ||
          setweight(to_tsvector('simple', public.unaccent(coalesce(m.name, ''))), 'A') ||
          setweight(to_tsvector('simple', public.unaccent(coalesce(p.sku, ''))), 'B') ||
          setweight(to_tsvector('simple', public.unaccent(coalesce(p.category, ''))), 'B') ||
          setweight(to_tsvector('simple', public.unaccent(coalesce(p.description, ''))), 'C') ||
          setweight(to_tsvector('simple', public.unaccent(coalesce(p.technical_info, ''))), 'C'),
          ts_query_or
        )
      ) * 
      CASE 
        WHEN (
          to_tsvector('simple', public.unaccent(coalesce(p.name, ''))) ||
          to_tsvector('simple', public.unaccent(coalesce(m.name, ''))) ||
          to_tsvector('simple', public.unaccent(coalesce(p.sku, ''))) ||
          to_tsvector('simple', public.unaccent(coalesce(p.category, ''))) ||
          to_tsvector('simple', public.unaccent(coalesce(p.description, ''))) ||
          to_tsvector('simple', public.unaccent(coalesce(p.technical_info, '')))
        ) @@ ts_query_and THEN 2.0
        ELSE 1.0
      END * boost_multiplier
    )::numeric AS final_rank
  FROM public.products p
  LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
  WHERE coalesce(p.is_discontinued, false) = false
    AND (
      to_tsvector('simple', public.unaccent(coalesce(p.name, ''))) ||
      to_tsvector('simple', public.unaccent(coalesce(m.name, ''))) ||
      to_tsvector('simple', public.unaccent(coalesce(p.sku, ''))) ||
      to_tsvector('simple', public.unaccent(coalesce(p.category, ''))) ||
      to_tsvector('simple', public.unaccent(coalesce(p.description, ''))) ||
      to_tsvector('simple', public.unaccent(coalesce(p.technical_info, '')))
    ) @@ ts_query_or
  ORDER BY final_rank DESC
  LIMIT 40;
END;
$$ LANGUAGE plpgsql;
