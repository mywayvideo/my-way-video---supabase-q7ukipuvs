-- Fix: market_intelligence table missing DEFAULT on id and created_at columns
-- This caused HTTP 500 when process-knowledge inserted without explicit id/created_at

ALTER TABLE public.market_intelligence
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.market_intelligence
  ALTER COLUMN created_at SET DEFAULT now();
