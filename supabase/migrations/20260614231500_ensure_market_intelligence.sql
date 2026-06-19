CREATE TABLE IF NOT EXISTS public.market_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    ai_summary TEXT,
    event_name TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.market_intelligence ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.market_intelligence ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.market_intelligence ADD COLUMN IF NOT EXISTS event_name TEXT;
ALTER TABLE public.market_intelligence ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

ALTER TABLE public.market_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.market_intelligence;
CREATE POLICY "Enable read access for all users" ON public.market_intelligence FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable all for authenticated admin users" ON public.market_intelligence;
CREATE POLICY "Enable all for authenticated admin users" ON public.market_intelligence FOR ALL TO authenticated USING (true) WITH CHECK (true);
