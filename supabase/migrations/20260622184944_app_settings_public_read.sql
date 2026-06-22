ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access on app_settings" ON public.app_settings;
CREATE POLICY "Allow public read access on app_settings" ON public.app_settings FOR SELECT USING (true);
GRANT SELECT ON public.app_settings TO anon, authenticated;
