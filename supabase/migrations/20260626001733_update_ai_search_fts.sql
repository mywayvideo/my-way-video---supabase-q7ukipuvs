CREATE OR REPLACE FUNCTION execute_ai_search_v3(search_term text)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'stock', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'description', p.description,
          'price_usd', p.price_usd,
          'price_brl', p.price_brl,
          'image_url', p.image_url,
          'category', p.category,
          'sku', p.sku,
          'stock', p.stock,
          'is_discontinued', p.is_discontinued,
          'manufacturer_name', m.name
        )
      ), '[]'::jsonb)
      FROM (
        SELECT p.*,
               ts_rank(to_tsvector('portuguese', coalesce(p.name, '') || ' ' || coalesce(p.description, '') || ' ' || coalesce(p.category, '')), plainto_tsquery('portuguese', search_term)) as rank
        FROM public.products p
        WHERE to_tsvector('portuguese', coalesce(p.name, '') || ' ' || coalesce(p.description, '') || ' ' || coalesce(p.category, '')) @@ plainto_tsquery('portuguese', search_term)
           OR p.name ILIKE '%' || search_term || '%'
           OR p.sku ILIKE '%' || search_term || '%'
        ORDER BY rank DESC
        LIMIT 15
      ) p
      LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
