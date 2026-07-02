-- 1. Refactor is_admin() function with SECURITY DEFINER and explicit search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.customers
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 2. Refactor check_is_admin() function with SECURITY DEFINER and explicit search_path
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated;

-- 3. Drop ALL existing policies on customers table to remove legacy conflicts
DO $$
BEGIN
  -- Drop all SELECT policies
  DROP POLICY IF EXISTS "User Owned Access" ON public.customers;
  DROP POLICY IF EXISTS "Admin Full Access" ON public.customers;
  DROP POLICY IF EXISTS "admin_all_customers" ON public.customers;
  DROP POLICY IF EXISTS "user_read_own_customer" ON public.customers;
  DROP POLICY IF EXISTS "user_update_own_customer" ON public.customers;
  DROP POLICY IF EXISTS "Enable SELECT for admins - all data" ON public.customers;
  DROP POLICY IF EXISTS "Enable SELECT for users own data only" ON public.customers;
  DROP POLICY IF EXISTS "Enable UPDATE for admins - all data" ON public.customers;
  DROP POLICY IF EXISTS "Enable UPDATE for users own data only" ON public.customers;
  DROP POLICY IF EXISTS "Enable INSERT for authenticated users" ON public.customers;
  DROP POLICY IF EXISTS "Enable DELETE for admins only" ON public.customers;
  DROP POLICY IF EXISTS "Enable SELECT for authenticated users" ON public.customers;
  DROP POLICY IF EXISTS "Enable SELECT for admins (all data)" ON public.customers;
  DROP POLICY IF EXISTS "Enable UPDATE for authenticated users" ON public.customers;
  DROP POLICY IF EXISTS "Enable UPDATE for admins (all data)" ON public.customers;
  DROP POLICY IF EXISTS "Enable INSERT for authenticated users" ON public.customers;
  DROP POLICY IF EXISTS "Enable DELETE for admins" ON public.customers;
  DROP POLICY IF EXISTS "Users can read own customer data" ON public.customers;
  DROP POLICY IF EXISTS "Users can update own customer data" ON public.customers;
  DROP POLICY IF EXISTS "Users can insert own customer data" ON public.customers;
END $$;

-- 4. Create clean, single SELECT policy for customers
-- Admins see all records; authenticated users see only their own
CREATE POLICY "customers_select_policy" ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR auth.uid() = user_id
  );

-- 5. Create INSERT policy (admins can insert; users can insert their own)
CREATE POLICY "customers_insert_policy" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR auth.uid() = user_id
  );

-- 6. Create UPDATE policy (admins can update all; users can update their own)
CREATE POLICY "customers_update_policy" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR auth.uid() = user_id
  )
  WITH CHECK (
    public.is_admin() OR auth.uid() = user_id
  );

-- 7. Create DELETE policy (admins only)
CREATE POLICY "customers_delete_policy" ON public.customers
  FOR DELETE TO authenticated
  USING (public.is_admin());
