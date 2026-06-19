CREATE OR REPLACE FUNCTION complete_user_migration(cust_id UUID, new_uid UUID)
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.customers
  SET 
    user_id = new_uid,
    is_imported = FALSE,
    has_migrated = TRUE,
    updated_at = NOW()
  WHERE id = cust_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_legacy_user(email_input text)
 RETURNS TABLE(id uuid, found boolean, full_name text, phone text, cpf text, billing_address jsonb, role character varying, is_imported boolean, has_migrated boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  WHERE c.email ILIKE trim(lower(email_input))
  LIMIT 1;
END;
$function$;
