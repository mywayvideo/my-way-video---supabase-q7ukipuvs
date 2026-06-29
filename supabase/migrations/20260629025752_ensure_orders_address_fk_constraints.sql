-- Ensure customer_addresses has a primary key on id (required for FK references)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_addresses'::regclass
      AND contype = 'p'
  ) THEN
    -- Remove any duplicate id values before adding PK
    DELETE FROM public.customer_addresses a
    USING public.customer_addresses b
    WHERE a.id = b.id AND a.ctid < b.ctid;

    ALTER TABLE public.customer_addresses ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Ensure orders table has shipping_address_id and billing_address_id columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shipping_address_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN shipping_address_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'billing_address_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN billing_address_id UUID;
  END IF;
END $$;

-- Remove ALL existing FK constraints on orders.shipping_address_id and orders.billing_address_id
-- that do NOT match the expected names, to avoid PGRST200 ambiguity errors.
DO $$
DECLARE
  rec RECORD;
BEGIN
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

-- Create the correctly named FK constraint for shipping_address_id
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

-- Create the correctly named FK constraint for billing_address_id
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

-- Ensure authenticated users can SELECT addresses (own + admin)
DROP POLICY IF EXISTS "Users can view own addresses" ON public.customer_addresses;
CREATE POLICY "Users can view own addresses" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admin Full Access customer_addresses" ON public.customer_addresses;
CREATE POLICY "Admin Full Access customer_addresses" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin'));

-- Grant SELECT to authenticated role
GRANT SELECT ON public.customer_addresses TO authenticated;

-- Reload PostgREST schema cache so new constraints are recognized
NOTIFY pgrst, 'reload schema';
