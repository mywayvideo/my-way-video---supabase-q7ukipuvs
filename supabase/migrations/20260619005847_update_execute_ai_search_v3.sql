CREATE OR REPLACE FUNCTION public.execute_ai_search_v3(search_term text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_query tsquery;
  v_mi json;
  v_stock json;
  v_psc json;
  v_clean_term text;
BEGIN
  -- Process search_term to prefix format: 'sony:* & fx3:*'
  -- 1. Replace all non-alphanumeric characters with spaces
  -- 2. Split by spaces, append :*, and join with &
  SELECT string_agg(quote_literal(lexeme) || ':*', ' & ')
  INTO v_clean_term
  FROM unnest(regexp_split_to_array(trim(regexp_replace(search_term, '[^\w\s]', ' ', 'g')), '\s+')) AS lexeme
  WHERE lexeme <> '';

  -- If empty query, return empty json
  IF v_clean_term IS NULL OR v_clean_term = '' THEN
    RETURN json_build_object('mi', '[]'::json, 'pc', '[]'::json, 'psc', '[]'::json, 'stock', '[]'::json);
  END IF;

  BEGIN
    v_query := v_clean_term::tsquery;
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('mi', '[]'::json, 'pc', '[]'::json, 'psc', '[]'::json, 'stock', '[]'::json);
  END;

  -- 1. stock / pc: search in products table
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', p.id,
      'name', p.name,
      'sku', p.sku,
      'price_usd', p.price_usd,
      'price_brl', p.price_brl,
      'stock', p.stock,
      'category', p.category,
      'image_url', p.image_url,
      'description', p.description,
      'manufacturer_id', p.manufacturer_id,
      'technical_info', p.technical_info
    )
  ), '[]'::json)
  INTO v_stock
  FROM public.products p
  WHERE p.search_vector @@ v_query
    AND NOT COALESCE(p.is_discontinued, false)
  LIMIT 20;

  -- 2. mi: search in market_intelligence table
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', mi.id,
      'title', mi.title,
      'ai_summary', mi.ai_summary
    )
  ), '[]'::json)
  INTO v_mi
  FROM public.market_intelligence mi
  WHERE to_tsvector('simple', COALESCE(mi.title, '') || ' ' || COALESCE(mi.raw_content, '') || ' ' || COALESCE(mi.ai_summary, '')) @@ v_query
    AND (mi.status = 'published' OR mi.status IS NULL)
  LIMIT 5;

  -- 3. psc: search in product_search_cache
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', psc.id,
      'product_name', psc.product_name,
      'search_query', psc.search_query,
      'product_description', psc.product_description,
      'product_price', psc.product_price,
      'product_currency', psc.product_currency,
      'product_image_url', psc.product_image_url
    )
  ), '[]'::json)
  INTO v_psc
  FROM public.product_search_cache psc
  WHERE to_tsvector('simple', COALESCE(psc.search_query, '') || ' ' || COALESCE(psc.product_name, '') || ' ' || COALESCE(psc.product_description, '')) @@ v_query
    AND COALESCE(psc.expires_at, now() + interval '1 day') > now()
  LIMIT 5;

  RETURN json_build_object(
    'mi', v_mi,
    'pc', v_stock,
    'psc', v_psc,
    'stock', v_stock
  );
END $$;
