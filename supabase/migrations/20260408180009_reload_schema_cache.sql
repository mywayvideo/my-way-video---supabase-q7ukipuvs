ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_data JSONB;

-- Force postgREST to reload its schema cache so the new column is immediately available
NOTIFY pgrst, 'reload schema';
