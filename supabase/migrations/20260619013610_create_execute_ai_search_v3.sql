CREATE OR REPLACE FUNCTION public.execute_ai_search_v3(search_term text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_search_query text;
  v_stock json;
  v_pc json;
  v_psc json;
  v_mi json;
BEGIN
  -- 1. Normalize the search term: remove extra spaces
  v_search_query := trim(search_term);
  
  IF v_search_query = '' OR v_search_query IS NULL THEN
    RETURN json_build_object('stock', '[]'::json, 'pc', '[]'::json, 'psc', '[]'::json, 'mi', '[]'::json);
  END IF;

  -- 2. Transform space-separated words into a prefix-matching tsquery
  -- E.g., 'sony fx3' -> 'sony:* & fx3:*'
  WITH words AS (
    SELECT unnest(regexp_split_to_array(v_search_query, '\s+')) AS w
  )
  SELECT string_agg(w || ':*', ' & ') INTO v_search_query FROM words WHERE w <> '';

  IF v_search_query IS NULL THEN
    RETURN json_build_object('stock', '[]'::json, 'pc', '[]'::json, 'psc', '[]'::json, 'mi', '[]'::json);
  END IF;

  -- 3. Get Product Catalog (stock)
  -- Prefix matching for better accuracy on camera models (e.g. fx3, r5)
  SELECT json_agg(row_to_json(p))
  INTO v_stock
  FROM (
    SELECT 
      pr.id,
      pr.name,
      pr.sku,
      pr.description,
      pr.price_usd,
      pr.price_brl,
      pr.stock,
      pr.category,
      m.name as manufacturer,
      pr.technical_info
    FROM public.products pr
    LEFT JOIN public.manufacturers m ON pr.manufacturer_id = m.id
    WHERE 
      pr.is_discontinued = false AND
      (
        pr.search_vector @@ to_tsquery('simple', v_search_query) OR
        pr.name ILIKE '%' || search_term || '%' OR
        pr.sku ILIKE '%' || search_term || '%'
      )
    ORDER BY 
      ts_rank(pr.search_vector, to_tsquery('simple', v_search_query)) DESC,
      pr.stock DESC NULLS LAST
    LIMIT 15
  ) p;

  -- 4. Get Product Cache (pc)
  SELECT json_agg(row_to_json(pc))
  INTO v_pc
  FROM (
    SELECT spec_key, spec_value, confidence, source
    FROM public.product_cache
    WHERE 
      spec_value ILIKE '%' || search_term || '%'
    LIMIT 10
  ) pc;

  -- 5. Get Product Search Cache (psc)
  SELECT json_agg(row_to_json(psc))
  INTO v_psc
  FROM (
    SELECT search_query, product_name, product_description, product_price
    FROM public.product_search_cache
    WHERE 
      search_query ILIKE '%' || search_term || '%' OR
      product_name ILIKE '%' || search_term || '%'
    LIMIT 10
  ) psc;

  -- 6. Get Market Intelligence (mi)
  SELECT json_agg(row_to_json(mi))
  INTO v_mi
  FROM (
    SELECT id, title, ai_summary, raw_content, source_url
    FROM public.market_intelligence
    WHERE 
      title ILIKE '%' || search_term || '%' OR
      ai_summary ILIKE '%' || search_term || '%' OR
      raw_content ILIKE '%' || search_term || '%'
    LIMIT 5
  ) mi;

  RETURN json_build_object(
    'stock', COALESCE(v_stock, '[]'::json),
    'pc', COALESCE(v_pc, '[]'::json),
    'psc', COALESCE(v_psc, '[]'::json),
    'mi', COALESCE(v_mi, '[]'::json)
  );
END;
$function$;
