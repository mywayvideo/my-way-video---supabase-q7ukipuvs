-- Update check_legacy_user to return required fields and be accessible to anon
DROP FUNCTION IF EXISTS public.check_legacy_user(text);

CREATE OR REPLACE FUNCTION public.check_legacy_user(email_input text)
RETURNS TABLE(
    id uuid, 
    found boolean, 
    full_name text, 
    phone text, 
    cpf text, 
    billing_address jsonb, 
    role character varying, 
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
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    (c.is_imported = TRUE AND c.has_migrated = FALSE) as found,
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

GRANT EXECUTE ON FUNCTION public.check_legacy_user(text) TO anon, authenticated;
