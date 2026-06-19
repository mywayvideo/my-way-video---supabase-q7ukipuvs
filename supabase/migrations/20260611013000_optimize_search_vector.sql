-- Drop existing column to avoid conflicts
ALTER TABLE public.products DROP COLUMN IF EXISTS search_vector CASCADE;

-- Add new optimized search_vector column
ALTER TABLE public.products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', COALESCE(sku, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(name, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(description, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(technical_info::text, '')), 'D')
  ) STORED;

-- Create GIN index
CREATE INDEX IF NOT EXISTS idx_products_search ON public.products USING GIN (search_vector);

-- Update search_products_v2 RPC
CREATE OR REPLACE FUNCTION public.search_products_v2(search_term text, boost_multiplier numeric DEFAULT 1.0)
 RETURNS TABLE(id uuid, name text, description text, sku text, manufacturer text, category text, price_usd numeric, price_nationalized_sales numeric, price_nationalized_currency text, final_rank real)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  clean_term text;
  query_string text;
BEGIN
  -- Sanitize the input: replace non-alphanumeric characters with spaces
  clean_term := regexp_replace(trim(search_term), '[^0-9a-zA-Z\s]', ' ', 'g');
  -- Collapse multiple spaces into a single space and trim again
  clean_term := trim(regexp_replace(clean_term, '\s+', ' ', 'g'));
  
  -- Return empty result if search term becomes empty after sanitization
  IF clean_term = '' THEN
    RETURN;
  END IF;

  -- Convert to prefix-matching query string (e.g., "word1:* & word2:*")
  query_string := replace(clean_term, ' ', ':* & ') || ':*';

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
    (ts_rank_cd(p.search_vector, to_tsquery('simple', query_string)) * COALESCE(boost_multiplier, 1.0))::real as final_rank
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
$function$;

-- Update execute_ai_search_v2 SQL RPC to match the same logic
CREATE OR REPLACE FUNCTION public.execute_ai_search_v2(search_term text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result jsonb;
    clean_term text;
    query_string text;
BEGIN
    clean_term := regexp_replace(trim(search_term), '[^0-9a-zA-Z\s]', ' ', 'g');
    clean_term := trim(regexp_replace(clean_term, '\s+', ' ', 'g'));
    
    IF clean_term = '' THEN
        RETURN jsonb_build_object(
            'domain_rejected', false,
            'stock', '[]'::jsonb,
            'mi', '[]'::jsonb,
            'psc', '[]'::jsonb,
            'pc', '{}'::jsonb
        );
    END IF;

    query_string := replace(clean_term, ' ', ':* & ') || ':*';

    SELECT jsonb_build_object(
        'domain_rejected', false,
        'stock', COALESCE((
            SELECT jsonb_agg(p_row) FROM (
                SELECT 
                    p.id,
                    p.name,
                    p.description,
                    p.sku,
                    COALESCE(m.name, '') as manufacturer_name,
                    p.category,
                    p.price_usd,
                    p.price_nationalized_sales,
                    p.price_nationalized_currency,
                    (ts_rank_cd(p.search_vector, to_tsquery('simple', query_string)))::real as final_rank
                FROM 
                    public.products p
                LEFT JOIN 
                    public.manufacturers m ON p.manufacturer_id = m.id
                WHERE 
                    p.is_discontinued = false
                    AND p.search_vector @@ to_tsquery('simple', query_string)
                ORDER BY 
                    final_rank DESC
                LIMIT 40
            ) p_row
        ), '[]'::jsonb),
        'mi', '[]'::jsonb,
        'psc', '[]'::jsonb,
        'pc', '{}'::jsonb
    ) INTO result;

    RETURN result;
END;
$function$;
