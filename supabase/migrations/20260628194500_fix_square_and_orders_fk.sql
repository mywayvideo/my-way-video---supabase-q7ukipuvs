-- 1. Revert sandbox square_application_id back to production format
-- Migration 20260628184812 incorrectly changed it to sandbox format
UPDATE public.app_settings
SET setting_value = 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'
WHERE setting_key = 'square_application_id'
  AND setting_value = 'sandbox-sq0idb-OHYfHUECJ_anf5-s5ZuttQ';

-- Ensure all three Square credentials are present with production values
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('square_application_id', 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'),
  ('square_location_id', 'L18BWSS4TTJ6X')
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = CASE
  WHEN setting_key = 'square_application_id' AND EXCLUDED.setting_value LIKE 'sq0idp-%' THEN EXCLUDED.setting_value
  WHEN setting_key = 'square_application_id' AND app_settings.setting_value LIKE 'sandbox-%' THEN 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'
  ELSE app_settings.setting_value
END;

-- Re-apply production application_id if it was set to sandbox by earlier migration
UPDATE public.app_settings
SET setting_value = 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ'
WHERE setting_key = 'square_application_id'
  AND setting_value LIKE 'sandbox-%';

-- 2. Add formal Foreign Key from orders.customer_id to customers.id
-- Using NOT VALID to avoid failing on any existing orphaned rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_id_fkey'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id)
    NOT VALID;
  END IF;
END $$;

-- 3. Seed default payment methods configuration
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES (
  'payment_methods_config',
  '{"stripe":true,"square":true,"paypal":true,"transferencia_miami":true,"zelle":true,"pix":true,"transferencia_brasil":true}'
)
ON CONFLICT (setting_key) DO NOTHING;
