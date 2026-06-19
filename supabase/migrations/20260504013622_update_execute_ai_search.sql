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
  SELECT id, name FROM public.manufacturers 
  WHERE (SELECT raw_term FROM search) ILIKE '%' || name || '%'
  LIMIT 1
),
filtered_parsed AS (
  SELECT word FROM parsed
  WHERE (SELECT count(*) FROM parsed) = 1 
     OR word NOT IN (
       SELECT lower(trim(s)) FROM unnest(string_to_array((SELECT name FROM target_manufacturer), ' ')) as s
     )
)
SELECT json_build_object(
  'stock', (
    SELECT COALESCE(json_agg(sub), '[]'::json) FROM (
      SELECT 
        p.id, p.name, p.sku, p.description, p.price_usd, p.stock, p.image_url, p.technical_info,
        p.price_nationalized_sales, p.price_usa_rebate, p.date_rebate, p.is_discontinued, p.ncm,
        m.name as manufacturer_name
      FROM public.products p
      LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
      WHERE (
        p.name ILIKE '%' || (SELECT raw_term FROM search) || '%' 
        OR p.sku ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR p.technical_info ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR p.description ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR EXISTS (
          SELECT 1 FROM filtered_parsed 
          WHERE (p.name ILIKE '%' || word || '%' OR p.sku ILIKE '%' || word || '%')
        )
        OR p.manufacturer_id = (SELECT id FROM target_manufacturer)
      )
      AND p.is_discontinued = false
      ORDER BY 
        CASE 
          WHEN p.sku ILIKE (SELECT raw_term FROM search) OR p.name ILIKE (SELECT raw_term FROM search) THEN 100
          WHEN p.name ILIKE (SELECT raw_term FROM search) || '%' THEN 80
          WHEN (SELECT count(*) FROM filtered_parsed) > 0 AND (SELECT count(*) FROM filtered_parsed WHERE p.name ILIKE '%' || word || '%' OR p.sku ILIKE '%' || word || '%') = (SELECT count(*) FROM filtered_parsed) THEN 60
          WHEN p.technical_info ILIKE '%' || (SELECT raw_term FROM search) || '%' OR p.description ILIKE '%' || (SELECT raw_term FROM search) || '%' THEN 40
          WHEN p.manufacturer_id = (SELECT id FROM target_manufacturer) THEN 20
          ELSE COALESCE((SELECT count(*) FROM filtered_parsed WHERE p.name ILIKE '%' || word || '%' OR p.sku ILIKE '%' || word || '%'), 0) * 5
        END DESC,
        CASE 
          WHEN p.sku ILIKE (SELECT raw_term FROM search) OR p.name ILIKE (SELECT raw_term FROM search) THEN p.price_usd
          WHEN p.name ILIKE (SELECT raw_term FROM search) || '%' THEN p.price_usd
          ELSE NULL
        END DESC NULLS LAST,
        p.price_usd ASC NULLS LAST
      LIMIT 30
    ) sub
  ),
  'intel', (
    SELECT COALESCE(json_agg(c), '[]'::json) 
    FROM (
      SELECT title, ai_summary, raw_content
      FROM public.market_intelligence 
      WHERE status = 'published' 
      AND (
        title ILIKE '%' || (SELECT raw_term FROM search) || '%' 
        OR ai_summary ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR raw_content ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR metadata::text ILIKE '%' || (SELECT raw_term FROM search) || '%'
      )
      LIMIT 3
    ) c
  ),
  'nab_data', (
    SELECT COALESCE(json_agg(n), '[]'::json) 
    FROM (
      SELECT title, ai_summary as content
      FROM public.market_intelligence 
      WHERE status = 'published' 
      AND (
        title ILIKE '%' || (SELECT raw_term FROM search) || '%' 
        OR ai_summary ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR raw_content ILIKE '%' || (SELECT raw_term FROM search) || '%'
        OR title ILIKE '%NAB%' 
        OR ai_summary ILIKE '%NAB%'
        OR raw_content ILIKE '%NAB%'
        OR event_name ILIKE '%NAB%'
      ) 
      LIMIT 3
    ) n
  )
);
$function$;
