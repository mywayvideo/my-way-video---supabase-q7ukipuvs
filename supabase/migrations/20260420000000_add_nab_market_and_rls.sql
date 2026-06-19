CREATE TABLE IF NOT EXISTS public.nab_market (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.nab_market ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Public Access" ON public.products;
    CREATE POLICY "Public Access" ON public.products FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Public Access" ON public.market_intelligence;
    CREATE POLICY "Public Access" ON public.market_intelligence FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public Access" ON public.nab_market;
    CREATE POLICY "Public Access" ON public.nab_market FOR SELECT USING (true);
END $$;
