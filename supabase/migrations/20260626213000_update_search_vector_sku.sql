-- Update the generated columns for text search
DO $DO$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_search_vector_update') THEN
    CREATE OR REPLACE FUNCTION products_search_vector_trigger() RETURNS trigger AS $func$
    BEGIN
      NEW.search_vector := to_tsvector('portuguese', coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.category, '') || ' ' || coalesce(NEW.sku, ''));
      NEW.fts_vector := NEW.search_vector;
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    CREATE TRIGGER products_search_vector_update
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION products_search_vector_trigger();
  ELSE
    CREATE OR REPLACE FUNCTION products_search_vector_trigger() RETURNS trigger AS $func$
    BEGIN
      NEW.search_vector := to_tsvector('portuguese', coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.category, '') || ' ' || coalesce(NEW.sku, ''));
      NEW.fts_vector := NEW.search_vector;
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $DO$;

-- Update existing rows in batches
DO $DO$
DECLARE
  batch_size INT := 1000;
  affected INT;
BEGIN
  LOOP
    UPDATE public.products
    SET 
      search_vector = to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '') || ' ' || coalesce(sku, '')),
      fts_vector = to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '') || ' ' || coalesce(sku, ''))
    WHERE id IN (
      SELECT id FROM public.products 
      WHERE search_vector IS DISTINCT FROM to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '') || ' ' || coalesce(sku, ''))
      LIMIT batch_size
    );
    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
    PERFORM pg_sleep(0.1);
  END LOOP;
END $DO$;

-- Update execute_ai_search_v3 to leverage the new vector and handle SKU matches properly
CREATE OR REPLACE FUNCTION execute_ai_search_v3(search_term text)
RETURNS jsonb AS $func$
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
          'technical_info', p.technical_info,
          'manufacturer_name', m.name
        )
      ), '[]'::jsonb)
      FROM (
        SELECT p.*,
               ts_rank(p.search_vector, plainto_tsquery('portuguese', search_term)) as rank
        FROM public.products p
        LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
        WHERE p.search_vector @@ plainto_tsquery('portuguese', search_term)
           OR p.name ILIKE '%' || search_term || '%'
           OR p.sku ILIKE '%' || search_term || '%'
           OR m.name ILIKE '%' || search_term || '%'
           OR concat_ws(' ', m.name, p.name) ILIKE '%' || search_term || '%'
           OR concat_ws(' ', m.name, p.sku) ILIKE '%' || search_term || '%'
        ORDER BY 
          CASE WHEN p.sku ILIKE search_term THEN 0 ELSE 1 END,
          CASE WHEN concat_ws(' ', m.name, p.sku) ILIKE search_term THEN 0 ELSE 1 END,
          CASE WHEN p.name ILIKE search_term THEN 0 ELSE 1 END,
          CASE WHEN concat_ws(' ', m.name, p.name) ILIKE search_term THEN 0 ELSE 1 END,
          CASE WHEN p.sku ILIKE search_term || '%' THEN 0 ELSE 1 END,
          rank DESC
        LIMIT 15
      ) p
      LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
    )
  ) INTO result;
  
  RETURN result;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update search_products_v2
CREATE OR REPLACE FUNCTION public.search_products_v2(search_term text, boost_multiplier double precision DEFAULT 1.0)
RETURNS SETOF products
LANGUAGE plpgsql
AS $func$
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
    OR p.sku ILIKE search_term
    OR concat_ws(' ', m.name, p.sku) ILIKE search_term
    OR p.search_vector @@ plainto_tsquery('portuguese', search_term)
  ORDER BY 
    CASE WHEN p.sku ILIKE search_term THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.sku) ILIKE search_term THEN 0 ELSE 1 END,
    CASE WHEN p.name ILIKE search_term THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE search_term THEN 0 ELSE 1 END,
    CASE WHEN p.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE search_term || '%' THEN 0 ELSE 1 END,
    CASE WHEN p.sku ILIKE search_term || '%' THEN 0 ELSE 1 END,
    CASE WHEN p.name ILIKE '%' || search_term || '%' THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE '%' || search_term || '%' THEN 0 ELSE 1 END,
    ts_rank(p.search_vector, plainto_tsquery('portuguese', search_term)) DESC
  LIMIT 50;
END;
$func$;
