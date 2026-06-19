ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_data JSONB;
