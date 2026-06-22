CREATE OR REPLACE FUNCTION public.execute_ai_search_v3(search_term text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stock_results jsonb;
  pc_results jsonb;
  psc_results jsonb;
  mi_results jsonb;
BEGIN
  -- Products (Stock)
  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
  INTO stock_results
  FROM (
    SELECT *
    FROM public.products
    WHERE name ILIKE '%' || search_term || '%'
       OR description ILIKE '%' || search_term || '%'
       OR sku ILIKE '%' || search_term || '%'
    LIMIT 20
  ) p;

  -- Product Cache
  SELECT COALESCE(jsonb_agg(row_to_json(pc)), '[]'::jsonb)
  INTO pc_results
  FROM (
    SELECT *
    FROM public.product_cache
    WHERE spec_value ILIKE '%' || search_term || '%'
    LIMIT 10
  ) pc;

  -- Product Search Cache
  SELECT COALESCE(jsonb_agg(row_to_json(psc)), '[]'::jsonb)
  INTO psc_results
  FROM (
    SELECT *
    FROM public.product_search_cache
    WHERE search_query ILIKE '%' || search_term || '%'
       OR product_name ILIKE '%' || search_term || '%'
    LIMIT 10
  ) psc;

  -- Market Intelligence
  SELECT COALESCE(jsonb_agg(row_to_json(mi)), '[]'::jsonb)
  INTO mi_results
  FROM (
    SELECT *
    FROM public.market_intelligence
    WHERE title ILIKE '%' || search_term || '%'
       OR raw_content ILIKE '%' || search_term || '%'
    LIMIT 10
  ) mi;

  RETURN jsonb_build_object(
    'stock', stock_results,
    'pc', pc_results,
    'psc', psc_results,
    'mi', mi_results
  );
END;
$$;
