CREATE TABLE IF NOT EXISTS public.price_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_rate NUMERIC NOT NULL DEFAULT 5.2655,
    exchange_spread NUMERIC NOT NULL DEFAULT 0.20,
    freight_per_kg_usd NUMERIC NOT NULL DEFAULT 120,
    weight_margin NUMERIC NOT NULL DEFAULT 0.5,
    markup NUMERIC NOT NULL DEFAULT 0.8,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.price_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated select on price_settings" ON public.price_settings;
CREATE POLICY "Allow authenticated select on price_settings" ON public.price_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admin update on price_settings" ON public.price_settings;
CREATE POLICY "Allow admin update on price_settings" ON public.price_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Allow admin insert on price_settings" ON public.price_settings;
CREATE POLICY "Allow admin insert on price_settings" ON public.price_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'));

INSERT INTO public.price_settings (exchange_rate, exchange_spread, freight_per_kg_usd, weight_margin, markup)
SELECT 5.2655, 0.20, 120, 0.5, 0.8
WHERE NOT EXISTS (SELECT 1 FROM public.price_settings);
