-- Seed default price settings
INSERT INTO public.price_settings (
  id,
  exchange_rate,
  exchange_spread,
  freight_per_kg_usd,
  markup,
  weight_margin
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  5.0,
  0.0,
  0.0,
  1.0,
  0.0
) ON CONFLICT (id) DO NOTHING;

-- Drop existing read policies if they exist to ensure idempotency
DROP POLICY IF EXISTS "Enable read access for all users" ON public.price_settings;
DROP POLICY IF EXISTS "Allow public read access" ON public.price_settings;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.price_settings;

-- Create a comprehensive RLS policy that allows SELECT operations for all users (including authenticated and anon)
CREATE POLICY "Enable read access for all users" ON public.price_settings
  FOR SELECT USING (true);
