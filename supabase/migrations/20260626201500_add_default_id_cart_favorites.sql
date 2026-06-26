DO $$
BEGIN
    -- Set default for id in cart_items if it doesn't have one
    ALTER TABLE public.cart_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
    
    -- Set default for id in favorites if it doesn't have one
    ALTER TABLE public.favorites ALTER COLUMN id SET DEFAULT gen_random_uuid();
END $$;
