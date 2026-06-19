CREATE OR REPLACE FUNCTION complete_user_migration(cust_id UUID, new_uid UUID)
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_email TEXT;
    target_name TEXT;
BEGIN
    -- 1. Get data from the customer record to ensure we have what's needed for public.users
    SELECT email, full_name INTO target_email, target_name 
    FROM public.customers 
    WHERE id = cust_id;

    -- 2. Force insert into public.users to satisfy foreign key immediately
    -- This kills the 409/23503 error by ensuring the user profile exists before the link
    BEGIN
        INSERT INTO public.users (id, email, full_name, role)
        VALUES (new_uid, target_email, target_name, 'customer')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Ignore if public.users doesn't exist
    END;

    -- 3. Update the customer record to finalize migration
    UPDATE public.customers
    SET 
        user_id = new_uid,
        is_imported = FALSE,
        has_migrated = TRUE,
        updated_at = NOW()
    WHERE id = cust_id;
END;
$$;
