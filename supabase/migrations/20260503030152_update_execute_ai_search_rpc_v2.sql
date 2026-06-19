DO $do$
BEGIN
  -- Safely replace the function for ai search algorithm
END $do$;

CREATE OR REPLACE FUNCTION public.execute_ai_search(search_term text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH settings_data AS (
  SELECT 
    (SELECT custom_stop_words FROM public.ai_settings ORDER BY created_at DESC LIMIT 1) as admin_stop_words,
    trim(search_term) as raw_term
),
search AS (
  SELECT raw_term FROM settings_data
),
parsed AS (
  SELECT word 
  FROM unnest(string_to_array(lower((SELECT raw_term FROM search)), ' ')) as word
  WHERE (length(word) >= 2 
  AND word NOT IN (
    SELECT trim(s) 
    FROM unnest(string_to_array(lower(COALESCE((SELECT admin_stop_words FROM settings_data), '')), ',')) as s
    WHERE trim(s) <> ''
  ))
  OR (word ~ '\d' AND length(word) >= 2)
),
target_manufacturer AS (
  SELECT id FROM public.manufacturers 
  WHERE (SELECT raw_term FROM search) ILIKE '%' || name || '%'
  LIMIT 1
)
SELECT json_build_object(
  'stock', (
    SELECT COALESCE(json_agg(p), '[]'::json) FROM (
      SELECT 
        p.id, p.name, p.sku, p.description, p.price_usd, p.stock, p.image_url, p.technical_info,
        p.price_nationalized_sales, p.price_usa_rebate, p.date_rebate, p.is_discontinued,
        m.name as manufacturer_name
      FROM public.products p
      LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
      WHERE (
        p.name ILIKE '%' || (SELECT raw_term FROM search) || '%' 
        OR p.sku ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR EXISTS (
          SELECT 1 FROM parsed 
          WHERE (p.name ILIKE '%' || word || '%' OR p.sku ILIKE '%' || word || '%')
        )
      )
      AND p.is_discontinued = false
      ORDER BY 
        CASE 
          WHEN p.sku ILIKE (SELECT raw_term FROM search) THEN 1 
          WHEN p.name ILIKE (SELECT raw_term FROM search) THEN 2 
          WHEN p.manufacturer_id = (SELECT id FROM target_manufacturer) THEN 3 
          WHEN p.name ILIKE '%' || (SELECT raw_term FROM search) || '%' THEN 4 
          ELSE 5 
        END,
        p.price_usd DESC
      LIMIT 30
    ) p
  ),
  'intel', (
    SELECT COALESCE(json_agg(c), '[]'::json) 
    FROM (
      SELECT title, ai_summary, raw_content
      FROM public.market_intelligence 
      WHERE (title ILIKE '%' || (SELECT raw_term FROM search) || '%' OR ai_summary ILIKE '%' || (SELECT raw_term FROM search) || '%') 
      AND status = 'published' 
      LIMIT 5
    ) c
  ),
  'nab_data', (
    SELECT COALESCE(json_agg(n), '[]'::json) 
    FROM (
      SELECT title, content 
      FROM public.nab_market 
      WHERE (title ILIKE '%' || (SELECT raw_term FROM search) || '%' OR content ILIKE '%' || (SELECT raw_term FROM search) || '%') 
      LIMIT 5
    ) n
  )
);
$function$;
