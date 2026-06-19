-- Ensure pricing_settings has correct RLS policies allowing anon selection for dynamic price calculations
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Allow anon select on pricing_settings" ON public.pricing_settings;
DROP POLICY IF EXISTS "Allow authenticated select on pricing_settings" ON public.pricing_settings;
DROP POLICY IF EXISTS "Allow authenticated update on pricing_settings" ON public.pricing_settings;
DROP POLICY IF EXISTS "Allow authenticated insert on pricing_settings" ON public.pricing_settings;

-- Create secure and permissive read policies
CREATE POLICY "Allow anon select on pricing_settings" ON public.pricing_settings FOR SELECT USING (true);
CREATE POLICY "Allow authenticated select on pricing_settings" ON public.pricing_settings FOR SELECT TO authenticated USING (true);

-- Restrict mutations to authenticated users
CREATE POLICY "Allow authenticated update on pricing_settings" ON public.pricing_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated insert on pricing_settings" ON public.pricing_settings FOR INSERT TO authenticated WITH CHECK (true);
