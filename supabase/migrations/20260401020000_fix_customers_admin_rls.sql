-- Create a security definer function to safely check admin role without infinite recursion
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.customers 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;
  
  RETURN v_is_admin;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated;

-- Drop existing admin policies that rely solely on JWT role
DROP POLICY IF EXISTS "Enable SELECT for admins - all data" ON public.customers;
DROP POLICY IF EXISTS "Enable UPDATE for admins - all data" ON public.customers;
DROP POLICY IF EXISTS "Enable DELETE for admins only" ON public.customers;

-- Drop duplicate or older policies just in case
DROP POLICY IF EXISTS "Enable SELECT for admins" ON public.customers;
DROP POLICY IF EXISTS "Enable UPDATE for admins" ON public.customers;

-- Recreate admin policies using the safe function and JWT checks as fallback
CREATE POLICY "Enable SELECT for admins - all data" ON public.customers
FOR SELECT TO authenticated 
USING (
  public.check_is_admin() OR 
  (auth.jwt() ->> 'role' = 'admin') OR 
  (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin') OR 
  (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
);

CREATE POLICY "Enable UPDATE for admins - all data" ON public.customers
FOR UPDATE TO authenticated 
USING (
  public.check_is_admin() OR 
  (auth.jwt() ->> 'role' = 'admin') OR 
  (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin') OR 
  (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
);

CREATE POLICY "Enable DELETE for admins only" ON public.customers
FOR DELETE TO authenticated 
USING (
  public.check_is_admin() OR 
  (auth.jwt() ->> 'role' = 'admin') OR 
  (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin') OR 
  (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
);
