-- Seed the Stripe publishable key into app_settings
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'stripe_publishable_key',
  'pk_test_51TJNpuCdgoPTpkApWlzlJzlPeqsTHmrbITutsHkVq8zI9yeux7hVXYGN1ygGKTu9vFZUguDO3muKjI2E7ezvI8vw00APSiHyYh',
  'Stripe Publishable Key for frontend payment integration'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Create function to enforce single default address per customer
CREATE OR REPLACE FUNCTION public.enforce_single_default_address()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.customer_addresses
    SET is_default = false
    WHERE customer_id = NEW.customer_id
      AND id <> NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for INSERT and UPDATE on is_default
DROP TRIGGER IF EXISTS enforce_single_default_address_trigger ON public.customer_addresses;
CREATE TRIGGER enforce_single_default_address_trigger
  AFTER INSERT OR UPDATE OF is_default ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_address();
