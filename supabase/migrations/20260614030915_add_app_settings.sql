CREATE TABLE IF NOT EXISTS public.app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_public_select_app_settings" ON public.app_settings;
CREATE POLICY "allow_public_select_app_settings"
  ON public.app_settings
  FOR SELECT
  USING (true);

DO $$
BEGIN
  INSERT INTO public.app_settings (setting_key, setting_value, description)
  VALUES 
    ('company_admin_email', 'admin@mywayvideo.com', 'Admin email for legal and policy pages'),
    ('social_instagram', 'https://www.instagram.com/mywayvideopro/', 'Instagram profile URL'),
    ('social_facebook', 'https://www.facebook.com/MyWayVideoPro', 'Facebook page URL')
  ON CONFLICT (setting_key) DO NOTHING;
END $$;
