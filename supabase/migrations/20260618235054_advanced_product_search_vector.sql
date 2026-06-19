-- Ensure unaccent extension is enabled
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Ensure the search_vector column exists
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create the function to generate the search vector
CREATE OR REPLACE FUNCTION public.generate_product_search_vector(p_id uuid)
RETURNS tsvector AS $$
DECLARE
    v_product RECORD;
    v_mfg_name TEXT;
    v_specs TEXT;
    v_vector tsvector;
BEGIN
    -- Get product details
    SELECT name, sku, category, description, manufacturer_id 
    INTO v_product 
    FROM public.products 
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Get manufacturer name
    v_mfg_name := '';
    IF v_product.manufacturer_id IS NOT NULL THEN
        SELECT name INTO v_mfg_name 
        FROM public.manufacturers 
        WHERE id = v_product.manufacturer_id;
    END IF;

    -- Get specs from product_cache
    SELECT string_agg(spec_value, ' ') INTO v_specs 
    FROM public.product_cache 
    WHERE product_id = p_id;

    -- Generate vector with weights
    v_vector := 
        setweight(to_tsvector('simple', unaccent(COALESCE(v_product.name, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(v_product.sku, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(v_mfg_name, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(v_product.category, ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(v_product.description, ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(v_specs, ''))), 'C');

    RETURN v_vector;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for products table
CREATE OR REPLACE FUNCTION public.trg_products_search_vector_update_func()
RETURNS trigger AS $$
DECLARE
    v_mfg_name TEXT := '';
    v_specs TEXT := '';
BEGIN
    IF NEW.manufacturer_id IS NOT NULL THEN
        SELECT name INTO v_mfg_name 
        FROM public.manufacturers 
        WHERE id = NEW.manufacturer_id;
    END IF;

    IF NEW.id IS NOT NULL THEN
        SELECT string_agg(spec_value, ' ') INTO v_specs 
        FROM public.product_cache 
        WHERE product_id = NEW.id;
    END IF;

    NEW.search_vector := 
        setweight(to_tsvector('simple', unaccent(COALESCE(NEW.name, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(NEW.sku, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(v_mfg_name, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(NEW.category, ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(NEW.description, ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(COALESCE(v_specs, ''))), 'C');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_search_vector_update ON public.products;
CREATE TRIGGER trg_products_search_vector_update
BEFORE INSERT OR UPDATE OF name, sku, category, description, manufacturer_id
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.trg_products_search_vector_update_func();

-- Trigger function for product_cache table
CREATE OR REPLACE FUNCTION public.trg_cache_products_search_vector_update_func()
RETURNS trigger AS $$
DECLARE
    v_product_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_product_id := OLD.product_id;
    ELSE
        v_product_id := NEW.product_id;
    END IF;

    IF v_product_id IS NOT NULL THEN
        UPDATE public.products 
        SET search_vector = public.generate_product_search_vector(v_product_id)
        WHERE id = v_product_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cache_products_search_vector_update ON public.product_cache;
CREATE TRIGGER trg_cache_products_search_vector_update
AFTER INSERT OR UPDATE OR DELETE
ON public.product_cache
FOR EACH ROW
EXECUTE FUNCTION public.trg_cache_products_search_vector_update_func();

-- Create GIN index
CREATE INDEX IF NOT EXISTS idx_products_search_vector_gin_advanced 
ON public.products USING GIN (search_vector);

-- Backfill data
DO $$
DECLARE
    batch_size INT := 500;
    affected INT;
    last_id UUID := '00000000-0000-0000-0000-000000000000'::uuid;
    v_ids UUID[];
BEGIN
    LOOP
        SELECT array_agg(id) INTO v_ids
        FROM (
            SELECT id 
            FROM public.products 
            WHERE id > last_id
            ORDER BY id ASC 
            LIMIT batch_size
        ) t;

        IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
            EXIT;
        END IF;

        UPDATE public.products 
        SET search_vector = public.generate_product_search_vector(id)
        WHERE id = ANY(v_ids);

        last_id := v_ids[array_length(v_ids, 1)];
        
        PERFORM pg_sleep(0.05);
    END LOOP;
END $$;
