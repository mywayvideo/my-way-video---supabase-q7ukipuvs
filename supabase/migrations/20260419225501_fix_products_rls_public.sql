DO $$
BEGIN
    DROP POLICY IF EXISTS "Public Access" ON public.products;
    CREATE POLICY "Public Access" ON public.products FOR SELECT USING (true);
END $$;
