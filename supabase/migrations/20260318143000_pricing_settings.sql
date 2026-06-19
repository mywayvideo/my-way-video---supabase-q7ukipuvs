CREATE TABLE IF NOT EXISTS public.pricing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spread_type TEXT NOT NULL DEFAULT 'percentage',
    spread_value NUMERIC NOT NULL DEFAULT 0.10,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select on pricing_settings" ON public.pricing_settings;
CREATE POLICY "Allow anon select on pricing_settings" ON public.pricing_settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow authenticated select on pricing_settings" ON public.pricing_settings;
CREATE POLICY "Allow authenticated select on pricing_settings" ON public.pricing_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated update on pricing_settings" ON public.pricing_settings;
CREATE POLICY "Allow authenticated update on pricing_settings" ON public.pricing_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated insert on pricing_settings" ON public.pricing_settings;
CREATE POLICY "Allow authenticated insert on pricing_settings" ON public.pricing_settings FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO public.pricing_settings (spread_type, spread_value)
SELECT 'percentage', 0.10
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_settings);
