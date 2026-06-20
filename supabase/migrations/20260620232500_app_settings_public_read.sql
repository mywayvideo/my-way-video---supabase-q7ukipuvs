DO $$
BEGIN
  -- Enable RLS
  ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

  -- Create policy for public read access
  DROP POLICY IF EXISTS "Permitir leitura publica de app_settings" ON public.app_settings;
  CREATE POLICY "Permitir leitura publica de app_settings" ON public.app_settings
    FOR SELECT
    TO anon, authenticated
    USING (true);
END $$;

-- Grant select to anon and authenticated
GRANT SELECT ON public.app_settings TO anon, authenticated;

-- Seed contact data
INSERT INTO public.app_settings (id, setting_key, setting_value, updated_at)
VALUES 
  (gen_random_uuid(), 'company_address', E'1735 NW 79TH AVE Doral, FL 33126\nUSA', NOW()),
  (gen_random_uuid(), 'company_whatsapp', '+1 (786) 716-1170', NOW()),
  (gen_random_uuid(), 'company_email', 'sales@mywayvideo.com', NOW())
ON CONFLICT (setting_key) DO NOTHING;
