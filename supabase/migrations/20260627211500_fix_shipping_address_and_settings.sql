-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure customer_addresses.id has DEFAULT gen_random_uuid()
ALTER TABLE public.customer_addresses ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Seed shipping settings into app_settings (idempotent)
INSERT INTO public.app_settings (setting_key, setting_value, setting_value_numeric, updated_at)
VALUES
  ('shipping_sao_paulo_price_per_kg', '120', 120, NOW()),
  ('shipping_sao_paulo_percentage_value', '10', 10, NOW()),
  ('shipping_sao_paulo_additional_weight_kg', '0.5', 0.5, NOW()),
  ('shipping_usa_fixed_rate', '25', 25, NOW()),
  ('shipping_usa_price_per_lb', '1.5', 1.5, NOW()),
  ('shipping_usa_formula', '{"base_cost": 25.0, "weight_price_per_kg": 3.0, "value_percentage": 1.5}', NULL, NOW())
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = COALESCE(EXCLUDED.setting_value, app_settings.setting_value),
  setting_value_numeric = COALESCE(EXCLUDED.setting_value_numeric, app_settings.setting_value_numeric),
  updated_at = NOW();

-- Ensure RLS is enabled on customer_addresses
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Reinforce RLS policies for customer_addresses (authenticated role)
DROP POLICY IF EXISTS "Users can view own addresses" ON public.customer_addresses;
CREATE POLICY "Users can view own addresses" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.customer_addresses;
CREATE POLICY "Users can insert own addresses" ON public.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own addresses" ON public.customer_addresses;
CREATE POLICY "Users can update own addresses" ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.customer_addresses;
CREATE POLICY "Users can delete own addresses" ON public.customer_addresses
  FOR DELETE TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Allow admins full access to customer_addresses
DROP POLICY IF EXISTS "Admin Full Access customer_addresses" ON public.customer_addresses;
CREATE POLICY "Admin Full Access customer_addresses" ON public.customer_addresses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'));

-- Ensure RLS is enabled on app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Reinforce public read on app_settings
DROP POLICY IF EXISTS "Public Read app_settings" ON public.app_settings;
CREATE POLICY "Public Read app_settings" ON public.app_settings
  FOR SELECT USING (true);

-- Allow admin full access to app_settings
DROP POLICY IF EXISTS "Admin Full Access app_settings" ON public.app_settings;
CREATE POLICY "Admin Full Access app_settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'));

-- Grant necessary permissions
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
