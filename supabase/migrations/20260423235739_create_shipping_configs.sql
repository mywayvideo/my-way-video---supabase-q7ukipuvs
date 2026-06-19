CREATE TABLE IF NOT EXISTS public.shipping_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_rate numeric NOT NULL DEFAULT 5.0,
  spread_percentage numeric NOT NULL DEFAULT 10.0,
  weight_factor numeric NOT NULL DEFAULT 50.0,
  fixed_import_fee numeric NOT NULL DEFAULT 100.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_shipping_configs" ON public.shipping_configs;
CREATE POLICY "public_read_shipping_configs" ON public.shipping_configs FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_all_shipping_configs" ON public.shipping_configs;
CREATE POLICY "admin_all_shipping_configs" ON public.shipping_configs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin')
);

INSERT INTO public.shipping_configs (exchange_rate, spread_percentage, weight_factor, fixed_import_fee)
SELECT 5.2, 10.0, 50.0, 100.0
WHERE NOT EXISTS (SELECT 1 FROM public.shipping_configs);
