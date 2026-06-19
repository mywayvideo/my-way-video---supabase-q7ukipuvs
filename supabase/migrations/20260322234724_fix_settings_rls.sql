-- Drop existing restrictive policies
DROP POLICY IF EXISTS "allow_admin_update_settings" ON public.settings;
DROP POLICY IF EXISTS "allow_admin_insert_settings" ON public.settings;
DROP POLICY IF EXISTS "allow_admin_write_settings" ON public.settings;

-- Create a robust policy for write operations that ensures authenticated users can upsert
CREATE POLICY "allow_admin_write_settings" ON public.settings
  FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin') OR 
    ((auth.jwt() -> 'user_metadata') ->> 'role' = 'admin') OR 
    ((auth.jwt() -> 'app_metadata') ->> 'role' = 'admin') OR
    (auth.role() = 'authenticated')
  )
  WITH CHECK (
    (auth.jwt() ->> 'role' = 'admin') OR 
    ((auth.jwt() -> 'user_metadata') ->> 'role' = 'admin') OR 
    ((auth.jwt() -> 'app_metadata') ->> 'role' = 'admin') OR
    (auth.role() = 'authenticated')
  );
