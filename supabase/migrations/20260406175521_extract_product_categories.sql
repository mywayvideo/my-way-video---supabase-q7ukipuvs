-- 1. Ensure categories table exists (it might already exist, but safe to check)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Extract unique categories and insert into categories table
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN (SELECT DISTINCT category FROM public.products WHERE category IS NOT NULL AND TRIM(category) != '') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE name = rec.category) THEN
      INSERT INTO public.categories (name) VALUES (rec.category);
    END IF;
  END LOOP;
END $$;

-- 3. Add category_id column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID;

-- 4. Update products with correct category_id values
UPDATE public.products p
SET category_id = c.id
FROM public.categories c
WHERE p.category = c.name
  AND p.category_id IS NULL;

-- 5. Add foreign key constraint on products.category_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'products_category_id_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.categories(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
