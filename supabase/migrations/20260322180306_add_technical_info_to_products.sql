-- 1. Add new column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS technical_info TEXT DEFAULT NULL;

-- Add comment to the new column
COMMENT ON COLUMN public.products.technical_info IS 'Advanced technical specifications in Markdown or HTML format';

-- 2. Create RLS policy for admin UPDATE
DROP POLICY IF EXISTS "allow_admin_update_products" ON public.products;
CREATE POLICY "allow_admin_update_products" ON public.products
  FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');
