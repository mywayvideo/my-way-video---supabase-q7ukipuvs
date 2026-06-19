-- Fix RLS policies to allow customers to create their own order items and history

-- 1. order_items
DROP POLICY IF EXISTS "Customers can insert own order items" ON public.order_items;
CREATE POLICY "Customers can insert own order items" ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (
  order_id IN (
    SELECT id FROM public.orders WHERE customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  )
);

-- 2. order_status_history
DROP POLICY IF EXISTS "Customers can insert own order status history" ON public.order_status_history;
CREATE POLICY "Customers can insert own order status history" ON public.order_status_history
FOR INSERT TO authenticated
WITH CHECK (
  order_id IN (
    SELECT id FROM public.orders WHERE customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  )
);

-- 3. orders (Ensure normal users can also update orders they own, e.g., to set status paid)
DROP POLICY IF EXISTS "Customers can update own orders" ON public.orders;
CREATE POLICY "Customers can update own orders" ON public.orders
FOR UPDATE TO authenticated
USING (
  customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  )
);
