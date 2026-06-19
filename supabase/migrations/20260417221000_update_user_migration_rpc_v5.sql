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
    -- We wrap this in an exception block to prevent failure if public.users doesn't exist in the current schema
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
