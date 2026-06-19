DO $$
BEGIN
    DROP POLICY IF EXISTS "Public Access" ON public.products;
    CREATE POLICY "Public Access" ON public.products FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "allow_public_read_products" ON public.products;
    CREATE POLICY "allow_public_read_products" ON public.products FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Public Access" ON public.market_intelligence;
    CREATE POLICY "Public Access" ON public.market_intelligence FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "allow_public_read_market_intelligence" ON public.market_intelligence;
    CREATE POLICY "allow_public_read_market_intelligence" ON public.market_intelligence FOR SELECT USING (true);
END $$;
