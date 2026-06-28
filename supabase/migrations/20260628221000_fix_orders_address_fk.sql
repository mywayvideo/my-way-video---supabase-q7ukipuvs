-- Ensure customer_addresses table exists (idempotent — matches original definition)
CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    address_type TEXT NOT NULL CHECK (address_type IN ('shipping', 'billing')),
    street TEXT NOT NULL,
    number TEXT NOT NULL,
    complement TEXT,
    neighborhood TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'Brasil',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure RLS is enabled
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

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

-- Create the named foreign key constraints that PostgREST expects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_shipping_address_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_shipping_address_id_fkey
      FOREIGN KEY (shipping_address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_billing_address_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_billing_address_id_fkey
      FOREIGN KEY (billing_address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS policies for customer_addresses (idempotent)
DROP POLICY IF EXISTS "Users can view own addresses" ON public.customer_addresses;
CREATE POLICY "Users can view own addresses" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.customer_addresses;
CREATE POLICY "Users can insert own addresses" ON public.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own addresses" ON public.customer_addresses;
CREATE POLICY "Users can update own addresses" ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.customer_addresses;
CREATE POLICY "Users can delete own addresses" ON public.customer_addresses
  FOR DELETE TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- Admin policies (idempotent)
DROP POLICY IF EXISTS "Admins can insert addresses" ON public.customer_addresses;
CREATE POLICY "Admins can insert addresses" ON public.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers WHERE customers.user_id = auth.uid() AND customers.role = 'admin'));

DROP POLICY IF EXISTS "Admins can update addresses" ON public.customer_addresses;
CREATE POLICY "Admins can update addresses" ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers WHERE customers.user_id = auth.uid() AND customers.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete addresses" ON public.customer_addresses;
CREATE POLICY "Admins can delete addresses" ON public.customer_addresses
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers WHERE customers.user_id = auth.uid() AND customers.role = 'admin'));
