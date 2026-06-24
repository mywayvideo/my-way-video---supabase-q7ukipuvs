DO $$
BEGIN
  -- Clean up any orphaned references before adding constraint to avoid violation errors
  DELETE FROM public.customer_favorites 
  WHERE product_id IS NOT NULL 
    AND product_id NOT IN (SELECT id FROM public.products);

  -- Add foreign key constraint from customer_favorites to products if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_favorites_product_id_fkey'
  ) THEN
    ALTER TABLE public.customer_favorites
    ADD CONSTRAINT customer_favorites_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;
