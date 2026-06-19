-- Drop and recreate orders status constraint to ensure it includes all required statuses
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

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

-- Ensure order_status_history constraints are also updated to prevent insertion errors
ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_new_status_check;

ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_new_status_check 
  CHECK (new_status::text = ANY (ARRAY[
    'pending'::character varying, 
    'pending_payment'::character varying, 
    'paid'::character varying, 
    'processing'::character varying, 
    'shipped'::character varying, 
    'delivered'::character varying, 
    'cancelled'::character varying
  ]::text[]));

ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_old_status_check;

ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_old_status_check 
  CHECK (old_status IS NULL OR old_status::text = ANY (ARRAY[
    'pending'::character varying, 
    'pending_payment'::character varying, 
    'paid'::character varying, 
    'processing'::character varying, 
    'shipped'::character varying, 
    'delivered'::character varying, 
    'cancelled'::character varying
  ]::text[]));
