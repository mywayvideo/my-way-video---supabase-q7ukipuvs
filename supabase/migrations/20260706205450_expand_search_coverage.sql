CREATE OR REPLACE FUNCTION public.execute_ai_search_v3(search_term text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stock_results jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'description', t.description,
      'price_usd', t.price_usd,
      'price_brl', t.price_brl,
      'image_url', t.image_url,
      'category', t.category,
      'sku', t.sku,
      'stock', t.stock,
      'is_discontinued', t.is_discontinued,
      'technical_info', t.technical_info,
      'manufacturer_name', t.manufacturer_name,
      'price_nationalized_sales', t.price_nationalized_sales,
      'price_nationalized_cost', t.price_nationalized_cost,
      'price_usa_rebate', t.price_usa_rebate,
      'weight', t.weight
    )
  ), '[]'::jsonb)
  INTO stock_results
  FROM (
    SELECT
      p.id, p.name, p.description, p.price_usd, p.price_brl,
      p.image_url, p.category, p.sku, p.stock, p.is_discontinued,
      p.technical_info, p.price_nationalized_sales, p.price_nationalized_cost,
      p.price_usa_rebate, p.weight,
      m.name AS manufacturer_name,
      (
        (CASE WHEN p.name ILIKE '%' || search_term || '%' THEN 3 ELSE 0 END) +
        (CASE WHEN p.sku ILIKE '%' || search_term || '%' THEN 2 ELSE 0 END) +
        (CASE WHEN p.description ILIKE '%' || search_term || '%' THEN 1 ELSE 0 END)
      ) AS relevance_weight
    FROM public.products p
    LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
    WHERE p.name ILIKE '%' || search_term || '%'
       OR p.sku ILIKE '%' || search_term || '%'
       OR p.description ILIKE '%' || search_term || '%'
       OR p.technical_info ILIKE '%' || search_term || '%'
    ORDER BY relevance_weight DESC
    LIMIT 50
  ) t;

  RETURN jsonb_build_object('stock', stock_results);
END;
$$;
