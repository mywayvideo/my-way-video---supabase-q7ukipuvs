-- Drop existing function if it exists to ensure clean replacement
DROP FUNCTION IF EXISTS public.search_products_v2(text, double precision);

-- Create the search_products_v2 function
CREATE OR REPLACE FUNCTION public.search_products_v2(
  search_term text,
  boost_multiplier double precision DEFAULT 1.0
)
RETURNS SETOF public.products
LANGUAGE plpgsql
AS $$
BEGIN
  -- Return empty if the search term is empty or just whitespace
  IF trim(search_term) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.products p
  WHERE 
    -- Full-text search match
    p.fts_vector @@ websearch_to_tsquery('portuguese', search_term)
    -- Fallback to partial matches for substrings and partial words
    OR p.name ILIKE '%' || search_term || '%'
    OR p.sku ILIKE '%' || search_term || '%'
  ORDER BY 
    -- Calculate relevance score based on full-text rank and exact/partial string matches
    (
      ts_rank_cd(p.fts_vector, websearch_to_tsquery('portuguese', search_term)) +
      (CASE 
        WHEN p.sku ILIKE search_term THEN 10.0
        WHEN p.sku ILIKE search_term || '%' THEN 5.0
        WHEN p.sku ILIKE '%' || search_term || '%' THEN 2.0
        WHEN p.name ILIKE search_term THEN 5.0
        WHEN p.name ILIKE search_term || '%' THEN 2.0
        WHEN p.name ILIKE '%' || search_term || '%' THEN 1.0
        ELSE 0.0 
      END)
    ) * boost_multiplier DESC
  LIMIT 100;
END;
$$;

-- Grant execution permissions for both anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.search_products_v2(text, double precision) TO anon, authenticated;
