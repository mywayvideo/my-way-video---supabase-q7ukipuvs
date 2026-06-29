ALTER TABLE public.orders
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.orders
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.orders SET created_at = now() WHERE created_at IS NULL;
UPDATE public.orders SET updated_at = now() WHERE updated_at IS NULL;
