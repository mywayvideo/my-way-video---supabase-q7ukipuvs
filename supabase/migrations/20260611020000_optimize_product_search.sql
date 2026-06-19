-- 1. Add generated search_vector column to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(sku, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(name, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(technical_info::text, '')), 'D')
) STORED;

-- 2. Create GIN index on the new search_vector column
CREATE INDEX IF NOT EXISTS idx_products_search ON public.products USING GIN (search_vector);

-- 3. Drop existing search_products_v2 function to avoid return type change errors
DROP FUNCTION IF EXISTS public.search_products_v2(text, numeric);
DROP FUNCTION IF EXISTS public.search_products_v2(text);

-- 4. Recreate search_products_v2 with optimized logic and explicit return types
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
  final_rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleaned_term text;
  query_string text;
BEGIN
  -- Sanitize the input: replace non-alphanumeric characters with spaces
  cleaned_term := regexp_replace(trim(search_term), '[^0-9a-zA-Z\s]', ' ', 'g');
  -- Collapse multiple spaces into a single space and trim again
  cleaned_term := trim(regexp_replace(cleaned_term, '\s+', ' ', 'g'));
  
  -- Return empty result if search term becomes empty after sanitization
  IF cleaned_term = '' THEN
    RETURN;
  END IF;

  -- Convert to prefix-matching query string (e.g., "word1:* & word2:*")
  query_string := replace(cleaned_term, ' ', ':* & ') || ':*';

  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.description,
    p.sku,
    COALESCE(m.name, '') as manufacturer,
    p.category,
    p.price_usd,
    p.price_nationalized_sales,
    p.price_nationalized_currency,
    (ts_rank_cd(p.search_vector, to_tsquery('simple', query_string)) * boost_multiplier)::real as final_rank
  FROM 
    public.products p
  LEFT JOIN 
    public.manufacturers m ON p.manufacturer_id = m.id
  WHERE 
    p.is_discontinued = false
    AND p.search_vector @@ to_tsquery('simple', query_string)
  ORDER BY 
    final_rank DESC
  LIMIT 40;
END;
$$;
