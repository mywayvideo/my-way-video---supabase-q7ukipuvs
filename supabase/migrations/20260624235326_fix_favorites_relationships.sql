-- Cleanup orphan records to avoid constraint violation
DELETE FROM public.favorites 
WHERE product_id IS NOT NULL 
AND product_id NOT IN (SELECT id FROM public.products);

-- Add foreign key constraint safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'favorites_product_id_fkey' 
      AND table_schema = 'public' 
      AND table_name = 'favorites'
  ) THEN
    ALTER TABLE public.favorites
    ADD CONSTRAINT favorites_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- Provide policy for authenticated users to select their own favorites
DROP POLICY IF EXISTS "favorites_select_own" ON public.favorites;
CREATE POLICY "favorites_select_own" ON public.favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Provide policy for authenticated users to insert their own favorites
DROP POLICY IF EXISTS "favorites_insert_own" ON public.favorites;
CREATE POLICY "favorites_insert_own" ON public.favorites
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Provide policy for authenticated users to update their own favorites
DROP POLICY IF EXISTS "favorites_update_own" ON public.favorites;
CREATE POLICY "favorites_update_own" ON public.favorites
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Provide policy for authenticated users to delete their own favorites
DROP POLICY IF EXISTS "favorites_delete_own" ON public.favorites;
CREATE POLICY "favorites_delete_own" ON public.favorites
  FOR DELETE TO authenticated USING (user_id = auth.uid());
