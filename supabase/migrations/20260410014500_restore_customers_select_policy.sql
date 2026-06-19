-- Drop the existing test policy
DROP POLICY IF EXISTS "Enable SELECT for admins - all data" ON public.customers;

-- Recreate with the proper role-based policy
CREATE POLICY "Enable SELECT for admins - all data" ON public.customers
FOR SELECT TO authenticated 
USING (
  (auth.uid() IS NOT NULL AND role = 'admin')
  OR
  (auth.uid() = user_id)
);
