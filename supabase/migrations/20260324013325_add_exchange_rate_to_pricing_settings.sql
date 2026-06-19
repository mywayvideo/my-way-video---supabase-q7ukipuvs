-- Add exchange_rate column to pricing_settings table if it doesn't exist
ALTER TABLE public.pricing_settings ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 5.00;
