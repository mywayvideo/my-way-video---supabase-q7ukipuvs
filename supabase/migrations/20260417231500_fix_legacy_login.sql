-- 1. Ensure check_legacy_user is accessible to anon role and correctly implemented
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
    has_migrated boolean
)
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

GRANT EXECUTE ON FUNCTION public.check_legacy_user(text) TO anon, authenticated;

-- 2. Ensure complete_user_migration uses the fully atomic logic exactly as defined in the user story
CREATE OR REPLACE FUNCTION public.complete_user_migration(cust_id uuid, new_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    target_email TEXT;
    target_name TEXT;
BEGIN
    -- 1. Get data from the customer record itself to avoid dependency on auth.users sync
    SELECT email, full_name INTO target_email, target_name 
    FROM public.customers 
    WHERE id = cust_id;

    -- 2. Manually insert into public.users to satisfy the foreign key constraint immediately
    BEGIN
        INSERT INTO public.users (id, email, full_name, role)
        VALUES (new_uid, target_email, target_name, 'customer')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Safely ignore if public.users table does not exist
    END;

    -- 3. Perform the link in customers table
    UPDATE public.customers
    SET 
        user_id = new_uid,
        is_imported = FALSE,
        has_migrated = TRUE,
        updated_at = NOW()
    WHERE id = cust_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_user_migration(uuid, uuid) TO anon, authenticated;
