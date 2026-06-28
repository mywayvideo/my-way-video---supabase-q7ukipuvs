-- Ensure orders.created_at has a default value of now()
-- This prevents null/zero-value dates (e.g. 31/12/1969) in the dashboard

ALTER TABLE public.orders
  ALTER COLUMN created_at SET DEFAULT now();

-- Backfill any existing NULL created_at values with the current timestamp
UPDATE public.orders SET created_at = now() WHERE created_at IS NULL;
