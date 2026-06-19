-- Drop existing policies on customers table
DROP POLICY IF EXISTS "Enable SELECT for authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Enable SELECT for admins (all data)" ON public.customers;
DROP POLICY IF EXISTS "Enable UPDATE for authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Enable UPDATE for admins (all data)" ON public.customers;
DROP POLICY IF EXISTS "Enable INSERT for authenticated users" ON public.customers;
DROP POLICY IF EXISTS "Enable DELETE for admins only" ON public.customers;
DROP POLICY IF EXISTS "Enable SELECT for admins - all data" ON public.customers;
DROP POLICY IF EXISTS "Enable SELECT for users own data only" ON public.customers;
DROP POLICY IF EXISTS "Enable UPDATE for admins - all data" ON public.customers;
DROP POLICY IF EXISTS "Enable UPDATE for users own data only" ON public.customers;
DROP POLICY IF EXISTS "Enable SELECT for admins" ON public.customers;
DROP POLICY IF EXISTS "Enable SELECT for users own data" ON public.customers;
DROP POLICY IF EXISTS "Enable DELETE for admins" ON public.customers;

-- Policy 1 — Enable SELECT for admins FIRST (all data):
CREATE POLICY "Enable SELECT for admins - all data" ON public.customers
FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'admin');

-- Policy 2 — Enable SELECT for regular users (own data only):
CREATE POLICY "Enable SELECT for users own data only" ON public.customers
FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Policy 3 — Enable UPDATE for admins FIRST (all data):
CREATE POLICY "Enable UPDATE for admins - all data" ON public.customers
FOR UPDATE TO authenticated USING (auth.jwt() ->> 'role' = 'admin');

-- Policy 4 — Enable UPDATE for regular users (own data only):
CREATE POLICY "Enable UPDATE for users own data only" ON public.customers
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Policy 5 — Enable INSERT for authenticated users:
CREATE POLICY "Enable INSERT for authenticated users" ON public.customers
FOR INSERT TO authenticated WITH CHECK (true);

-- Policy 6 — Enable DELETE for admins only:
CREATE POLICY "Enable DELETE for admins only" ON public.customers
FOR DELETE TO authenticated USING (auth.jwt() ->> 'role' = 'admin');
