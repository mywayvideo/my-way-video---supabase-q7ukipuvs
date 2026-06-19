DROP POLICY IF EXISTS "Enable SELECT for admins - all data" ON public.customers;

CREATE POLICY "Enable SELECT for admins - all data" ON public.customers
  FOR SELECT TO authenticated USING (
    check_is_admin() 
    OR ((auth.jwt() ->> 'role'::text) = 'admin'::text)
    OR (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)
    OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
    OR (auth.uid() = user_id)
  );
