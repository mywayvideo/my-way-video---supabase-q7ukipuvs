-- Ensure orders.created_at and updated_at have default values of now()
-- This prevents null/zero-value dates in the dashboard and emails

ALTER TABLE public.orders
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.orders
  ALTER COLUMN updated_at SET DEFAULT now();

-- Backfill any existing NULL values
UPDATE public.orders SET created_at = now() WHERE created_at IS NULL;
UPDATE public.orders SET updated_at = now() WHERE updated_at IS NULL;

-- Ensure brand-assets storage bucket has public read policy
-- This allows the email logo URL to render correctly in all email clients
DROP POLICY IF EXISTS "brand_assets_public_read" ON storage.objects;
CREATE POLICY "brand_assets_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'brand-assets');
