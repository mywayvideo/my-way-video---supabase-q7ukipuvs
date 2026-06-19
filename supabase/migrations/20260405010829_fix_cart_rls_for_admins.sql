-- Fix RLS policies to allow Admins to manage carts and orders for Assisted Checkout
DO $$
BEGIN
  -- Allow admins to manage all shopping carts
  DROP POLICY IF EXISTS "Admins can view all shopping carts" ON public.shopping_carts;
  CREATE POLICY "Admins can view all shopping carts" ON public.shopping_carts
      FOR SELECT TO authenticated
      USING (check_is_admin());

  DROP POLICY IF EXISTS "Admins can update all shopping carts" ON public.shopping_carts;
  CREATE POLICY "Admins can update all shopping carts" ON public.shopping_carts
      FOR UPDATE TO authenticated
      USING (check_is_admin());

  DROP POLICY IF EXISTS "Admins can insert all shopping carts" ON public.shopping_carts;
  CREATE POLICY "Admins can insert all shopping carts" ON public.shopping_carts
      FOR INSERT TO authenticated
      WITH CHECK (check_is_admin());

  DROP POLICY IF EXISTS "Admins can delete all shopping carts" ON public.shopping_carts;
  CREATE POLICY "Admins can delete all shopping carts" ON public.shopping_carts
      FOR DELETE TO authenticated
      USING (check_is_admin());

  -- Allow admins to manage all cart items
  DROP POLICY IF EXISTS "Admins can view all cart items" ON public.cart_items;
  CREATE POLICY "Admins can view all cart items" ON public.cart_items
      FOR SELECT TO authenticated
      USING (check_is_admin());

  DROP POLICY IF EXISTS "Admins can update all cart items" ON public.cart_items;
  CREATE POLICY "Admins can update all cart items" ON public.cart_items
      FOR UPDATE TO authenticated
      USING (check_is_admin());

  DROP POLICY IF EXISTS "Admins can insert all cart items" ON public.cart_items;
  CREATE POLICY "Admins can insert all cart items" ON public.cart_items
      FOR INSERT TO authenticated
      WITH CHECK (check_is_admin());

  DROP POLICY IF EXISTS "Admins can delete all cart items" ON public.cart_items;
  CREATE POLICY "Admins can delete all cart items" ON public.cart_items
      FOR DELETE TO authenticated
      USING (check_is_admin());

  -- Allow admins to insert orders on behalf of customers
  DROP POLICY IF EXISTS "Admins can insert orders" ON public.orders;
  CREATE POLICY "Admins can insert orders" ON public.orders
      FOR INSERT TO authenticated
      WITH CHECK (check_is_admin());

  -- Allow admins to insert order items on behalf of customers
  DROP POLICY IF EXISTS "Admins can insert order items" ON public.order_items;
  CREATE POLICY "Admins can insert order items" ON public.order_items
      FOR INSERT TO authenticated
      WITH CHECK (check_is_admin());

END $$;
