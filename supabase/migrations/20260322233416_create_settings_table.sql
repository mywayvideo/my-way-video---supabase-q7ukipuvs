-- 1. Create settings table
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert initial configuration
INSERT INTO public.settings (key, value, description) 
VALUES ('show_price_cost', 'false', 'Display cost price (FOB Miami) on product pages for admins')
ON CONFLICT (key) DO NOTHING;

-- Create index on key for faster lookups
CREATE INDEX IF NOT EXISTS idx_settings_key ON public.settings(key);

-- 2. Enable RLS on settings table
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT (all authenticated users can read)
DROP POLICY IF EXISTS "allow_all_read_settings" ON public.settings;
CREATE POLICY "allow_all_read_settings" ON public.settings
  FOR SELECT USING (true);

-- Policy for UPDATE (only admins can update)
DROP POLICY IF EXISTS "allow_admin_update_settings" ON public.settings;
CREATE POLICY "allow_admin_update_settings" ON public.settings
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Policy for INSERT (only admins can insert)
DROP POLICY IF EXISTS "allow_admin_insert_settings" ON public.settings;
CREATE POLICY "allow_admin_insert_settings" ON public.settings
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'admin');
