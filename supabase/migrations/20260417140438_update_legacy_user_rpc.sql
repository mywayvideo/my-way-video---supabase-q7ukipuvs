DROP FUNCTION IF EXISTS public.check_legacy_user(text);

CREATE OR REPLACE FUNCTION public.check_legacy_user(email_input TEXT)
RETURNS TABLE (
  id UUID,
  found BOOLEAN,
  full_name TEXT,
  phone TEXT,
  cpf TEXT,
  billing_address JSONB,
  role character varying,
  is_imported BOOLEAN,
  has_migrated BOOLEAN
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
    c.has_migrated
  FROM public.customers c
  WHERE c.email ILIKE email_input
  LIMIT 1;
END;
$$;
