-- Remove ALL existing FK constraints on orders.shipping_address_id and orders.billing_address_id
-- that do NOT match the expected names, to avoid PGRST200 ambiguity errors.
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Drop any FK constraint on shipping_address_id that is NOT named orders_shipping_address_id_fkey
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND conname <> 'orders_shipping_address_id_fkey'
      AND EXISTS (
        SELECT 1
        FROM unnest(conkey) AS col
        JOIN pg_attribute a
          ON a.attrelid = conrelid AND a.attnum = col
        WHERE a.attname = 'shipping_address_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;

  -- Drop any FK constraint on billing_address_id that is NOT named orders_billing_address_id_fkey
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND conname <> 'orders_billing_address_id_fkey'
      AND EXISTS (
        SELECT 1
        FROM unnest(conkey) AS col
        JOIN pg_attribute a
          ON a.attrelid = conrelid AND a.attnum = col
        WHERE a.attname = 'billing_address_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

-- Ensure the correctly named FK constraint for shipping_address_id exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_shipping_address_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_shipping_address_id_fkey
      FOREIGN KEY (shipping_address_id)
      REFERENCES public.customer_addresses(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure the correctly named FK constraint for billing_address_id exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_billing_address_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_billing_address_id_fkey
      FOREIGN KEY (billing_address_id)
      REFERENCES public.customer_addresses(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure RLS is enabled on customer_addresses
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Ensure authenticated users can SELECT their own addresses
DROP POLICY IF EXISTS "Users can view own addresses" ON public.customer_addresses;
CREATE POLICY "Users can view own addresses" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Ensure admins can SELECT all addresses
DROP POLICY IF EXISTS "Admin Full Access customer_addresses" ON public.customer_addresses;
CREATE POLICY "Admin Full Access customer_addresses" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'));

-- Grant SELECT to authenticated role
GRANT SELECT ON public.customer_addresses TO authenticated;
