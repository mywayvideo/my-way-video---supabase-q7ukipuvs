ALTER TABLE public.discounts ADD COLUMN IF NOT EXISTS target_type text DEFAULT 'specific';
ALTER TABLE public.discounts ADD COLUMN IF NOT EXISTS excluded_products uuid[] DEFAULT '{}';
