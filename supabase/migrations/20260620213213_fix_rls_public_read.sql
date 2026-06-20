-- Enable RLS on app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access to app_settings
DROP POLICY IF EXISTS "Allow public read access" ON public.app_settings;
CREATE POLICY "Allow public read access" ON public.app_settings FOR SELECT USING (true);

-- Enable RLS on company_info
ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;

-- Allow public read access to company_info
DROP POLICY IF EXISTS "Allow public read access" ON public.company_info;
CREATE POLICY "Allow public read access" ON public.company_info FOR SELECT USING (true);
