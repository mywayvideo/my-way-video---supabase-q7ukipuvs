CREATE OR REPLACE FUNCTION public.unified_search(search_term text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'stock', (
      SELECT COALESCE(json_agg(p), '[]'::json) FROM (
        SELECT * FROM products 
        WHERE ((name ILIKE '%' || search_term || '%') 
        OR (description ILIKE '%' || search_term || '%')
        OR (sku ILIKE '%' || search_term || '%'))
        AND is_discontinued = false
        ORDER BY 
          CASE WHEN sku ILIKE search_term THEN 0 WHEN sku ILIKE search_term || '%' THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT 20
      ) p
    ),
    'intel', (
      SELECT COALESCE(json_agg(c), '[]'::json) FROM (
        SELECT * FROM market_intelligence 
        WHERE ((raw_content ILIKE '%' || search_term || '%') 
        OR (title ILIKE '%' || search_term || '%')
        OR (ai_summary ILIKE '%' || search_term || '%'))
        AND status = 'published' 
        LIMIT 10
      ) c
    ),
    'nab_data', (
      SELECT COALESCE(json_agg(n), '[]'::json) FROM (
        SELECT * FROM nab_market 
        WHERE (title ILIKE '%' || search_term || '%' OR content ILIKE '%' || search_term || '%') 
        LIMIT 10
      ) n
    )
  );
$function$;
