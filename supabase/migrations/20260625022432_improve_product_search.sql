-- Improve product search to support manufacturer and product name combinations and tokenization

CREATE OR REPLACE FUNCTION public.search_products_v2(search_term text, boost_multiplier double precision DEFAULT 1.0)
RETURNS SETOF products
LANGUAGE plpgsql
AS $$
DECLARE
  tokens text[];
BEGIN
  IF search_term IS NULL OR trim(search_term) = '' THEN
    RETURN QUERY SELECT * FROM products ORDER BY created_at DESC LIMIT 50;
    RETURN;
  END IF;

  SELECT array_agg(t) INTO tokens
  FROM (SELECT unnest(string_to_array(regexp_replace(trim(search_term), '\s+', ' ', 'g'), ' ')) AS t) as sub
  WHERE t <> '';

  IF tokens IS NULL THEN
    RETURN QUERY SELECT * FROM products ORDER BY created_at DESC LIMIT 50;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM products p
  LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
  WHERE 
    (
      SELECT bool_and(
        concat_ws(' ', p.name, p.description, m.name, p.sku, p.category) ILIKE '%' || token || '%'
      )
      FROM unnest(tokens) AS token
    )
  ORDER BY 
    CASE WHEN p.name ILIKE search_term THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE search_term THEN 0 ELSE 1 END,
    CASE WHEN p.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE search_term || '%' THEN 0 ELSE 1 END,
    CASE WHEN p.sku ILIKE search_term THEN 0 ELSE 1 END,
    CASE WHEN p.name ILIKE '%' || search_term || '%' THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE '%' || search_term || '%' THEN 0 ELSE 1 END
  LIMIT 50;
END;
$$;


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
  tokens text[];
BEGIN
  IF search_term IS NULL OR trim(search_term) = '' THEN
    RETURN jsonb_build_object(
      'stock', '[]'::jsonb,
      'pc', '[]'::jsonb,
      'psc', '[]'::jsonb,
      'mi', '[]'::jsonb
    );
  END IF;

  SELECT array_agg(t) INTO tokens
  FROM (SELECT unnest(string_to_array(regexp_replace(trim(search_term), '\s+', ' ', 'g'), ' ')) AS t) as sub
  WHERE t <> '';

  IF tokens IS NULL THEN
    RETURN jsonb_build_object(
      'stock', '[]'::jsonb,
      'pc', '[]'::jsonb,
      'psc', '[]'::jsonb,
      'mi', '[]'::jsonb
    );
  END IF;

  -- 1. stock: products matching the search term
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO stock_results
  FROM (
    SELECT 
      p.id, p.name, p.sku, p.description, p.price_usd, p.price_brl, 
      p.stock, p.image_url, p.category, p.manufacturer_id, m.name as manufacturer_name
    FROM products p
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE 
      (
        SELECT bool_and(
          concat_ws(' ', p.name, p.description, m.name, p.sku, p.category) ILIKE '%' || token || '%'
        )
        FROM unnest(tokens) AS token
      )
    ORDER BY 
      CASE WHEN p.name ILIKE search_term THEN 0 ELSE 1 END,
      CASE WHEN concat_ws(' ', m.name, p.name) ILIKE search_term THEN 0 ELSE 1 END,
      CASE WHEN p.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
      CASE WHEN concat_ws(' ', m.name, p.name) ILIKE search_term || '%' THEN 0 ELSE 1 END,
      CASE WHEN p.sku ILIKE search_term THEN 0 ELSE 1 END,
      CASE WHEN p.name ILIKE '%' || search_term || '%' THEN 0 ELSE 1 END,
      CASE WHEN concat_ws(' ', m.name, p.name) ILIKE '%' || search_term || '%' THEN 0 ELSE 1 END
    LIMIT 20
  ) t;

  -- 2. pc: product cache
  SELECT COALESCE(jsonb_agg(row_to_json(pc)), '[]'::jsonb)
  INTO pc_results
  FROM (
    SELECT c.* 
    FROM product_cache c
    JOIN products p ON p.id = c.product_id
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE 
      (
        SELECT bool_and(
          concat_ws(' ', p.name, m.name, c.spec_key, c.spec_value) ILIKE '%' || token || '%'
        )
        FROM unnest(tokens) AS token
      )
    LIMIT 20
  ) pc;

  -- 3. psc: product search cache
  SELECT COALESCE(jsonb_agg(row_to_json(psc)), '[]'::jsonb)
  INTO psc_results
  FROM (
    SELECT * FROM product_search_cache
    WHERE 
      (
        SELECT bool_and(
          concat_ws(' ', search_query, product_name, product_description) ILIKE '%' || token || '%'
        )
        FROM unnest(tokens) AS token
      )
    LIMIT 20
  ) psc;

  -- 4. mi: market intelligence
  SELECT COALESCE(jsonb_agg(row_to_json(mi)), '[]'::jsonb)
  INTO mi_results
  FROM (
    SELECT mi.*, m.name as manufacturer_name
    FROM market_intelligence mi
    LEFT JOIN manufacturers m ON mi.manufacturer_id = m.id
    WHERE 
      (
        SELECT bool_and(
          concat_ws(' ', mi.title, mi.ai_summary, mi.raw_content, m.name) ILIKE '%' || token || '%'
        )
        FROM unnest(tokens) AS token
      )
    LIMIT 20
  ) mi;

  RETURN jsonb_build_object(
    'stock', stock_results,
    'pc', pc_results,
    'psc', psc_results,
    'mi', mi_results
  );
END;
$$;
