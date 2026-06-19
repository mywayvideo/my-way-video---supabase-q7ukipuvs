-- Policy 1 — Enable SELECT for authenticated users (own data)
DROP POLICY IF EXISTS "Enable SELECT for authenticated users" ON public.customers;
CREATE POLICY "Enable SELECT for authenticated users"
ON public.customers
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy 2 — Enable SELECT for admins (all data)
DROP POLICY IF EXISTS "Enable SELECT for admins (all data)" ON public.customers;
CREATE POLICY "Enable SELECT for admins (all data)"
ON public.customers
FOR SELECT
TO authenticated
USING ((SELECT role FROM auth.users WHERE id = auth.uid()) = 'admin');

-- Policy 3 — Enable UPDATE for authenticated users (own data)
DROP POLICY IF EXISTS "Enable UPDATE for authenticated users" ON public.customers;
CREATE POLICY "Enable UPDATE for authenticated users"
ON public.customers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 4 — Enable UPDATE for admins (all data)
DROP POLICY IF EXISTS "Enable UPDATE for admins (all data)" ON public.customers;
CREATE POLICY "Enable UPDATE for admins (all data)"
ON public.customers
FOR UPDATE
TO authenticated
USING ((SELECT role FROM auth.users WHERE id = auth.uid()) = 'admin')
WITH CHECK ((SELECT role FROM auth.users WHERE id = auth.uid()) = 'admin');

-- Policy 5 — Enable INSERT for authenticated users
DROP POLICY IF EXISTS "Enable INSERT for authenticated users" ON public.customers;
CREATE POLICY "Enable INSERT for authenticated users"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy 6 — Enable DELETE for admins only
DROP POLICY IF EXISTS "Enable DELETE for admins only" ON public.customers;
CREATE POLICY "Enable DELETE for admins only"
ON public.customers
FOR DELETE
TO authenticated
USING ((SELECT role FROM auth.users WHERE id = auth.uid()) = 'admin');
