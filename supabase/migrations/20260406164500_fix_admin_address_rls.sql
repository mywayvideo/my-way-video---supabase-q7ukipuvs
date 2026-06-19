-- Allow admins to insert customer addresses
DROP POLICY IF EXISTS "Admins can insert addresses" ON public.customer_addresses;
CREATE POLICY "Admins can insert addresses" ON public.customer_addresses 
  FOR INSERT TO authenticated 
  WITH CHECK (EXISTS ( SELECT 1 FROM public.customers WHERE customers.user_id = auth.uid() AND customers.role = 'admin'));

-- Allow admins to update customer addresses
DROP POLICY IF EXISTS "Admins can update addresses" ON public.customer_addresses;
CREATE POLICY "Admins can update addresses" ON public.customer_addresses 
  FOR UPDATE TO authenticated 
  USING (EXISTS ( SELECT 1 FROM public.customers WHERE customers.user_id = auth.uid() AND customers.role = 'admin'));

-- Allow admins to delete customer addresses
DROP POLICY IF EXISTS "Admins can delete addresses" ON public.customer_addresses;
CREATE POLICY "Admins can delete addresses" ON public.customer_addresses 
  FOR DELETE TO authenticated 
  USING (EXISTS ( SELECT 1 FROM public.customers WHERE customers.user_id = auth.uid() AND customers.role = 'admin'));
