DO $DO$
BEGIN
  -- Add primary key to orders if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.orders ADD PRIMARY KEY (id);
  END IF;

  -- Add primary key to order_items if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_items'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.order_items ADD PRIMARY KEY (id);
  END IF;

  -- Add foreign key from order_items to orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey'
  ) THEN
    ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id)
    ON DELETE CASCADE;
  END IF;

  -- Add foreign key from order_items to products
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_id_fkey'
  ) THEN
    ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id)
    ON DELETE RESTRICT;
  END IF;
END $DO$;
