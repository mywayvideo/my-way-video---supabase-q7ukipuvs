-- Add columns for legacy migration
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_imported BOOLEAN DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS has_migrated BOOLEAN DEFAULT false;

-- Create unique index on email to prevent duplicates during import and match securely
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_email ON public.customers (email) WHERE email IS NOT NULL;

-- Secure function to check legacy user status before login without exposing customer data
CREATE OR REPLACE FUNCTION public.check_legacy_user(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer RECORD;
BEGIN
  SELECT is_imported, has_migrated INTO v_customer
  FROM public.customers
  WHERE email = p_email
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'exists', true,
      'is_imported', v_customer.is_imported,
      'has_migrated', v_customer.has_migrated
    );
  ELSE
    RETURN jsonb_build_object('exists', false);
  END IF;
END;
$$;

-- Update trigger to handle mapping new auth users to legacy customer records
CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if there's a legacy imported user with this email
  IF EXISTS (SELECT 1 FROM public.customers WHERE email = NEW.email AND is_imported = true) THEN
    -- Update the existing legacy record with the real auth user_id
    UPDATE public.customers
    SET user_id = NEW.id,
        full_name = COALESCE(full_name, NEW.raw_user_meta_data->>'name'),
        is_imported = false,
        has_migrated = true
    WHERE email = NEW.email AND is_imported = true;
  ELSE
    -- Normal insert for new users
    INSERT INTO public.customers (user_id, full_name, email)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
