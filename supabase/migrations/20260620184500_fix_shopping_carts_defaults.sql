-- Set default values for shopping_carts table
ALTER TABLE public.shopping_carts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.shopping_carts ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.shopping_carts ALTER COLUMN updated_at SET DEFAULT now();
