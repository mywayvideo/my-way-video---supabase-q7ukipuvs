-- Migration: recreate public.execute_ai_search_v3 filtering out discontinued products
-- Fixes discontinued items (e.g. Sony BRC-X1000 SKU BRCX1000 and Sony BRC-H800 SKU BRCH800)
-- appearing in ai-search answers.
-- Restores "AND is_discontinued = false" in product_scores CTE that was lost in migration 20260706205450_expand_search_coverage.sql.
-- Keeps all other body aspects identical (scoring, matched_words, LIMIT 50, returned columns).

CREATE OR REPLACE FUNCTION public.execute_ai_search_v3(search_term text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stock_results jsonb;
BEGIN
  WITH words AS (
    SELECT DISTINCT trim(word) AS word
    FROM regexp_split_to_table(lower(search_term), '[[:space:],;.-]+') AS word
    WHERE length(trim(word)) > 1
  ),
  word_matches AS (
    SELECT
      p.id,
      p.name, p.description, p.price_usd, p.price_brl,
      p.image_url, p.category, p.sku, p.stock, p.is_discontinued,
      p.technical_info, p.price_nationalized_sales, p.price_nationalized_cost,
      p.price_usa_rebate, p.weight,
      m.name AS manufacturer_name,
      w.word,
      CASE
        WHEN p.name ILIKE '%' || w.word || '%' THEN 3
        WHEN p.sku ILIKE '%' || w.word || '%' THEN 2
        WHEN p.description ILIKE '%' || w.word || '%' THEN 1
        WHEN p.technical_info ILIKE '%' || w.word || '%' THEN 1
        ELSE 0
      END AS match_score
    FROM public.products p
    CROSS JOIN words w
    LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
    WHERE
      p.name ILIKE '%' || w.word || '%' OR
      p.sku ILIKE '%' || w.word || '%' OR
      p.description ILIKE '%' || w.word || '%' OR
      p.technical_info ILIKE '%' || w.word || '%'
  ),
  total_words AS (
    SELECT count(*) AS cnt FROM words
  ),
  product_scores AS (
    SELECT
      id, name, description, price_usd, price_brl,
      image_url, category, sku, stock, is_discontinued,
      technical_info, price_nationalized_sales, price_nationalized_cost,
      price_usa_rebate, weight, manufacturer_name,
      count(DISTINCT word) AS matched_words,
      sum(match_score) AS total_score
    FROM word_matches
    WHERE is_discontinued = false
    GROUP BY id, name, description, price_usd, price_brl,
      image_url, category, sku, stock, is_discontinued,
      technical_info, price_nationalized_sales, price_nationalized_cost,
      price_usa_rebate, weight, manufacturer_name
  ),
  ranked_products AS (
    SELECT ps.*
    FROM product_scores ps
    CROSS JOIN total_words tw
    WHERE ps.matched_words >= LEAST(tw.cnt, 2)
    ORDER BY ps.matched_words DESC, ps.total_score DESC, ps.name ASC
    LIMIT 50
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id, 'name', r.name, 'description', r.description,
      'price_usd', r.price_usd, 'price_brl', r.price_brl,
      'image_url', r.image_url, 'category', r.category,
      'sku', r.sku, 'stock', r.stock, 'is_discontinued', r.is_discontinued,
      'technical_info', r.technical_info,
      'manufacturer_name', r.manufacturer_name,
      'price_nationalized_sales', r.price_nationalized_sales,
      'price_nationalized_cost', r.price_nationalized_cost,
      'price_usa_rebate', r.price_usa_rebate,
      'weight', r.weight
    )
  ), '[]'::jsonb)
  INTO stock_results
  FROM ranked_products r;

  RETURN jsonb_build_object('stock', stock_results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_ai_search_v3(text) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
