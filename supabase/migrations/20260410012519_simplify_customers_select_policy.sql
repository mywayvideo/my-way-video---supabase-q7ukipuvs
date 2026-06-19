-- Drop the existing complex policy
DROP POLICY IF EXISTS "Enable SELECT for admins - all data" ON public.customers;

-- Recreate with a simple policy for testing purposes as requested
CREATE POLICY "Enable SELECT for admins - all data" ON public.customers
FOR SELECT TO authenticated 
USING (
  auth.uid() IS NOT NULL
);
