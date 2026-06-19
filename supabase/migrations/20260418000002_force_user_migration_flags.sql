CREATE OR REPLACE FUNCTION complete_user_migration(cust_id UUID, new_uid UUID)
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Ensure the user profile exists in public.users
    INSERT INTO public.users (id, email, role)
    SELECT id, email, 'customer'
    FROM auth.users 
    WHERE id = new_uid
    ON CONFLICT (id) DO NOTHING;

    -- 2. Update the customer record and FORCE the flags to change
    -- This is the critical fix to break the infinite loop
    UPDATE public.customers
    SET 
        user_id = new_uid,
        is_imported = FALSE,
        has_migrated = TRUE,
        updated_at = NOW()
    WHERE id = cust_id;
END;
$$;
