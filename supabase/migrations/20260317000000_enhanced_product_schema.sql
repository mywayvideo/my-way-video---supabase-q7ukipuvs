CREATE TABLE public.manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on manufacturers" ON public.manufacturers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read on manufacturers" ON public.manufacturers FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated insert on manufacturers" ON public.manufacturers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update on manufacturers" ON public.manufacturers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete on manufacturers" ON public.manufacturers FOR DELETE TO authenticated USING (true);

INSERT INTO public.manufacturers (name) VALUES ('Diversos') ON CONFLICT DO NOTHING;

ALTER TABLE public.products
ADD COLUMN manufacturer_id UUID REFERENCES public.manufacturers(id) ON DELETE SET NULL,
ADD COLUMN price_usd NUMERIC DEFAULT 0,
ADD COLUMN price_cost NUMERIC DEFAULT 0;

UPDATE public.products SET manufacturer_id = (SELECT id FROM public.manufacturers WHERE name = 'Diversos' LIMIT 1) WHERE manufacturer_id IS NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
DROP INDEX IF EXISTS products_sku_key;

CREATE UNIQUE INDEX products_manufacturer_sku_key ON public.products (manufacturer_id, sku);

INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Product Images Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Product Images Auth Upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Product Images Auth Update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Product Images Auth Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');
