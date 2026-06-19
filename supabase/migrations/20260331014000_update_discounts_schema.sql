ALTER TABLE public.discounts
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS customer_application_type TEXT,
ADD COLUMN IF NOT EXISTS customer_role TEXT;
