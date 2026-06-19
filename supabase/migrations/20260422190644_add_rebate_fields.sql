ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_usa_rebate NUMERIC(12,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_cost_rebate NUMERIC(12,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS date_rebate TIMESTAMPTZ;
