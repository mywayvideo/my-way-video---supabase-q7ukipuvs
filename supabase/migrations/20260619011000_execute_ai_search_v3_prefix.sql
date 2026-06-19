DROP FUNCTION IF EXISTS public.execute_ai_search_v3(text);

CREATE OR REPLACE FUNCTION public.execute_ai_search_v3(search_term text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  search_query tsquery;
  mi_results jsonb;
  pc_results jsonb;
  psc_results jsonb;
  stock_results jsonb;
BEGIN
  IF trim(search_term) = '' THEN
    RETURN jsonb_build_object(
      'mi', '[]'::jsonb,
      'pc', '[]'::jsonb,
      'psc', '[]'::jsonb,
      'stock', '[]'::jsonb
    );
  END IF;

  WITH tokens AS (
    SELECT lexeme 
    FROM unnest(tsvector_to_array(to_tsvector('simple', search_term))) AS lexeme
  )
  SELECT to_tsquery('simple', string_agg(lexeme || ':*', ' & ')) INTO search_query
  FROM tokens;

  IF search_query IS NULL THEN
    RETURN jsonb_build_object(
      'mi', '[]'::jsonb,
      'pc', '[]'::jsonb,
      'psc', '[]'::jsonb,
      'stock', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO stock_results
  FROM (
    SELECT id, name, sku, description, price_usd, price_brl, stock, image_url, category, manufacturer_id
    FROM public.products
    WHERE (fts_vector @@ search_query) OR (search_vector @@ search_query)
    ORDER BY ts_rank(fts_vector, search_query) DESC
    LIMIT 20
  ) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) INTO mi_results
  FROM (
    SELECT id, title, raw_content, ai_summary, source_url
    FROM public.market_intelligence
    WHERE to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(raw_content, '')) @@ search_query
    LIMIT 10
  ) m;

  SELECT COALESCE(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) INTO pc_results
  FROM (
    SELECT id, product_id, spec_key, spec_value
    FROM public.product_cache
    WHERE to_tsvector('simple', COALESCE(spec_value, '')) @@ search_query
    LIMIT 10
  ) pc;

  SELECT COALESCE(jsonb_agg(to_jsonb(psc)), '[]'::jsonb) INTO psc_results
  FROM (
    SELECT id, search_query as q, product_name, product_description
    FROM public.product_search_cache
    WHERE to_tsvector('simple', COALESCE(search_query, '') || ' ' || COALESCE(product_name, '')) @@ search_query
    LIMIT 10
  ) psc;

  RETURN jsonb_build_object(
    'mi', mi_results,
    'pc', pc_results,
    'psc', psc_results,
    'stock', stock_results
  );
END;
$function$;
