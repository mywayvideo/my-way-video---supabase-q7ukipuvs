-- Fix RLS policies for the categories table to allow authenticated users to manage them
DROP POLICY IF EXISTS "categories_select_public" ON public.categories;
DROP POLICY IF EXISTS "Enable INSERT for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable UPDATE for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable DELETE for authenticated users" ON public.categories;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_public" ON public.categories
  FOR SELECT USING (true);

CREATE POLICY "Enable INSERT for authenticated users" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable UPDATE for authenticated users" ON public.categories
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable DELETE for authenticated users" ON public.categories
  FOR DELETE TO authenticated USING (true);
