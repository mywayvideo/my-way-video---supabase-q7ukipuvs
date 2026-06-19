ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_discontinued BOOLEAN DEFAULT FALSE NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_discontinued ON public.products USING btree (is_discontinued);
