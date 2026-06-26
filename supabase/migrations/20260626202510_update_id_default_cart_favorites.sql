ALTER TABLE public.cart_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.favorites ALTER COLUMN id SET DEFAULT gen_random_uuid();
