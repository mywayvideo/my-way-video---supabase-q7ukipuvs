ALTER TABLE public.products ADD COLUMN is_special BOOLEAN NOT NULL DEFAULT false;

-- Add index on is_special for faster home page queries
CREATE INDEX IF NOT EXISTS products_is_special_idx ON public.products(is_special);
