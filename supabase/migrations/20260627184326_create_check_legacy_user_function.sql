-- Create check_legacy_user function to resolve PGRST202 error on /forgot-password
-- This function is called via RPC from ForgotPassword.tsx to check if a customer
-- with the given email exists and is a legacy (imported, not yet migrated) user.
-- Returns a TABLE with a `found` boolean column as expected by the frontend.

DROP FUNCTION IF EXISTS public.check_legacy_user(text);

CREATE OR REPLACE FUNCTION public.check_legacy_user(email_input text)
RETURNS TABLE(
    id uuid,
    found boolean,
    full_name text,
    phone text,
    cpf text,
    billing_address jsonb,
    role text,
    is_imported boolean,
    has_migrated boolean,
    email text,
    user_id uuid,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    (c.is_imported = TRUE AND c.has_migrated = FALSE) AS found,
    c.full_name,
    c.phone,
    c.cpf,
    c.billing_address,
    c.role,
    c.is_imported,
    c.has_migrated,
    c.email,
    c.user_id,
    c.status,
    c.created_at,
    c.updated_at
  FROM public.customers c
  WHERE c.email ILIKE trim(lower(email_input))
  LIMIT 1;
END;
$$;

-- Grant execution to anon and authenticated roles so the function can be
-- called via PostgREST RPC during the pre-login "Forgot Password" flow.
GRANT EXECUTE ON FUNCTION public.check_legacy_user(text) TO anon, authenticated;
