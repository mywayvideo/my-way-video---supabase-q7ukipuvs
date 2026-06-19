ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS billing_address JSONB,
ADD COLUMN IF NOT EXISTS shipping_address JSONB;
