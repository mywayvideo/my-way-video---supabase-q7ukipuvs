-- Create product-images storage bucket (public for read) if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ensure public read policy on product-images bucket
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'product-images');

-- Ensure authenticated & service_role upload/insert/update/delete policies
DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'product-images');

-- Table to log and track any image migration failures
CREATE TABLE IF NOT EXISTS public.image_migration_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  external_url TEXT NOT NULL,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_img_mig_fail_prod ON public.image_migration_failures(product_id);

-- Enable RLS on image_migration_failures
ALTER TABLE public.image_migration_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_migration_failures_admin_all" ON public.image_migration_failures;
CREATE POLICY "image_migration_failures_admin_all" ON public.image_migration_failures
  FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "image_migration_failures_auth_select" ON public.image_migration_failures;
CREATE POLICY "image_migration_failures_auth_select" ON public.image_migration_failures
  FOR SELECT TO authenticated USING (true);
