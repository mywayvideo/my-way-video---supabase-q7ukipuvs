CREATE OR REPLACE FUNCTION public.execute_ai_search(search_term text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH search AS (
  SELECT trim(search_term) as raw_term
),
parsed AS (
  SELECT word 
  FROM unnest(string_to_array(lower((SELECT raw_term FROM search)), ' ')) as word
  WHERE length(word) >= 2 
  AND word NOT IN ('de', 'da', 'do', 'em', 'no', 'na', 'um', 'os', 'as', 'to', 'at', 'in', 'of')
)
SELECT json_build_object(
  'stock', (
    SELECT COALESCE(json_agg(p), '[]'::json) FROM (
      SELECT 
        id, name, sku, description, price_usd, stock, image_url, technical_info, price_nationalized_sales, is_discontinued, date_rebate, price_usa_rebate
      FROM products 
      WHERE (
        name ILIKE '%' || (SELECT raw_term FROM search) || '%' 
        OR sku ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR EXISTS (
          SELECT 1 FROM parsed 
          WHERE (products.name ILIKE '%' || word || '%' OR products.sku ILIKE '%' || word || '%')
        )
      )
      AND is_discontinued = false
      ORDER BY 
        CASE 
          WHEN sku ILIKE (SELECT raw_term FROM search) THEN 1 
          WHEN name ILIKE (SELECT raw_term FROM search) THEN 2 
          WHEN name ILIKE '%' || (SELECT raw_term FROM search) || '%' THEN 3 
          ELSE 4 
        END,
        price_usd DESC
      LIMIT 30
    ) p
  ),
  'intel', (
    SELECT COALESCE(json_agg(c), '[]'::json) 
    FROM (
      SELECT title, ai_summary, raw_content
      FROM market_intelligence 
      WHERE (title ILIKE '%' || (SELECT raw_term FROM search) || '%' OR ai_summary ILIKE '%' || (SELECT raw_term FROM search) || '%') 
      AND status = 'published' 
      LIMIT 5
    ) c
  ),
  'nab_data', (
    SELECT COALESCE(json_agg(n), '[]'::json) 
    FROM (
      SELECT title, content 
      FROM nab_market 
      WHERE (title ILIKE '%' || (SELECT raw_term FROM search) || '%' OR content ILIKE '%' || (SELECT raw_term FROM search) || '%') 
      LIMIT 5
    ) n
  )
);
$function$;
