-- Fix RLS policies for shopping_carts
DROP POLICY IF EXISTS "Customers can create cart" ON public.shopping_carts;
CREATE POLICY "Customers can create cart" ON public.shopping_carts
  FOR INSERT TO public
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Customers can update own cart" ON public.shopping_carts;
CREATE POLICY "Customers can update own cart" ON public.shopping_carts
  FOR UPDATE TO public
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Customers can view own cart" ON public.shopping_carts;
CREATE POLICY "Customers can view own cart" ON public.shopping_carts
  FOR SELECT TO public
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Customers can delete own cart" ON public.shopping_carts;
CREATE POLICY "Customers can delete own cart" ON public.shopping_carts
  FOR DELETE TO public
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Fix RLS policies for cart_items
DROP POLICY IF EXISTS "Customers can add cart items" ON public.cart_items;
CREATE POLICY "Customers can add cart items" ON public.cart_items
  FOR INSERT TO public
  WITH CHECK (cart_id IN (SELECT id FROM public.shopping_carts WHERE customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS "Customers can update own cart items" ON public.cart_items;
CREATE POLICY "Customers can update own cart items" ON public.cart_items
  FOR UPDATE TO public
  USING (cart_id IN (SELECT id FROM public.shopping_carts WHERE customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS "Customers can view own cart items" ON public.cart_items;
CREATE POLICY "Customers can view own cart items" ON public.cart_items
  FOR SELECT TO public
  USING (cart_id IN (SELECT id FROM public.shopping_carts WHERE customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS "Customers can delete own cart items" ON public.cart_items;
CREATE POLICY "Customers can delete own cart items" ON public.cart_items
  FOR DELETE TO public
  USING (cart_id IN (SELECT id FROM public.shopping_carts WHERE customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())));

-- Fix RLS policies for price_settings and discounts
DROP POLICY IF EXISTS "Allow public read on price_settings" ON public.price_settings;
CREATE POLICY "Allow public read on price_settings" ON public.price_settings
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Allow public read on discounts" ON public.discounts;
CREATE POLICY "Allow public read on discounts" ON public.discounts
  FOR SELECT TO public
  USING (true);
