-- Clean up any invalid manufacturer_id values to prevent foreign key constraint violations
UPDATE public.products 
SET manufacturer_id = NULL 
WHERE manufacturer_id IS NOT NULL 
  AND manufacturer_id NOT IN (SELECT id FROM public.manufacturers);

-- Safely drop the constraint if it already exists to ensure idempotency
ALTER TABLE public.products 
  DROP CONSTRAINT IF EXISTS fk_products_manufacturer;

-- Establish the formal foreign key relationship
ALTER TABLE public.products 
  ADD CONSTRAINT fk_products_manufacturer 
  FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) 
  ON DELETE SET NULL;
