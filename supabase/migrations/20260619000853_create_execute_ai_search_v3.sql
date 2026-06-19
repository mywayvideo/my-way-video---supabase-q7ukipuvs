CREATE OR REPLACE FUNCTION public.execute_ai_search_v3(search_term text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_query tsquery;
  v_products json;
  v_mi json;
  v_manufacturer_ids uuid[];
BEGIN
  IF COALESCE(search_term, '') = '' THEN
    RETURN json_build_object(
      'products', '[]'::json,
      'market_intelligence', '[]'::json
    );
  END IF;

  -- Build tsquery using unaccented search term
  -- Fallback to plain search_term if unaccent fails or doesn't exist
  BEGIN
    v_query := websearch_to_tsquery('simple', public.unaccent(COALESCE(search_term, '')));
  EXCEPTION WHEN OTHERS THEN
    v_query := websearch_to_tsquery('simple', COALESCE(search_term, ''));
  END;

  -- Get top 10 products
  WITH top_products AS (
    SELECT 
      p.id, 
      p.name, 
      p.sku, 
      p.price_usd, 
      p.stock, 
      p.description, 
      p.manufacturer_id, 
      p.category,
      CASE WHEN numnode(v_query) > 0 THEN ts_rank(p.search_vector, v_query) ELSE 0 END AS rank
    FROM public.products p
    WHERE (numnode(v_query) > 0 AND p.search_vector @@ v_query)
       OR p.name ILIKE '%' || search_term || '%'
       OR p.sku ILIKE '%' || search_term || '%'
    ORDER BY rank DESC, p.name ASC
    LIMIT 10
  )
  SELECT 
    COALESCE(json_agg(
      json_build_object(
        'id', id,
        'name', name,
        'sku', sku,
        'price_usd', price_usd,
        'stock', stock,
        'description', description,
        'manufacturer_id', manufacturer_id,
        'category', category
      )
    ), '[]'::json),
    array_agg(DISTINCT manufacturer_id) FILTER (WHERE manufacturer_id IS NOT NULL)
  INTO v_products, v_manufacturer_ids
  FROM top_products;

  IF v_manufacturer_ids IS NULL THEN
    v_manufacturer_ids := '{}'::uuid[];
  END IF;

  -- Get top 5 market intelligence items
  WITH mi AS (
    SELECT title, ai_summary, source_url
    FROM public.market_intelligence
    WHERE manufacturer_id = ANY(v_manufacturer_ids)
       OR title ILIKE '%' || search_term || '%'
       OR ai_summary ILIKE '%' || search_term || '%'
    ORDER BY created_at DESC
    LIMIT 5
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'title', title,
      'ai_summary', ai_summary,
      'source_url', source_url
    )
  ), '[]'::json)
  INTO v_mi
  FROM mi;

  -- Return combined JSON
  RETURN json_build_object(
    'products', v_products,
    'market_intelligence', v_mi
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.execute_ai_search_v3(text) TO authenticated, anon, service_role;
