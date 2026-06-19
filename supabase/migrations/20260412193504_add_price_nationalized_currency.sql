ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_nationalized_currency TEXT NOT NULL DEFAULT 'BRL';
