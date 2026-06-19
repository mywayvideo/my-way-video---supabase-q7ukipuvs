-- Fix public access for products, market_intelligence and nab_market
DROP POLICY IF EXISTS "Public Access" ON public.products;
CREATE POLICY "Public Access" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Access" ON public.market_intelligence;
CREATE POLICY "Public Access" ON public.market_intelligence FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Access" ON public.nab_market;
CREATE POLICY "Public Access" ON public.nab_market FOR SELECT USING (true);
