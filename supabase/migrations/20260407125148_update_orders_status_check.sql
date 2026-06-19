DO $$
BEGIN
  -- Drop the existing constraint to allow updating it
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
  
  -- Add the new constraint with 'paid' and 'pending_payment' included
  ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
    CHECK (status::text = ANY (ARRAY[
      'pending'::character varying, 
      'pending_payment'::character varying, 
      'paid'::character varying, 
      'processing'::character varying, 
      'shipped'::character varying, 
      'delivered'::character varying, 
      'cancelled'::character varying
    ]::text[]));
END $$;
