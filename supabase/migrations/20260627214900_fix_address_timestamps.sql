-- Fix customer_addresses timestamp defaults to resolve "null value violates not-null constraint" (Error code: 23502)
ALTER TABLE public.customer_addresses
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- Backfill any existing NULL values
UPDATE public.customer_addresses
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.customer_addresses
SET updated_at = now()
WHERE updated_at IS NULL;
