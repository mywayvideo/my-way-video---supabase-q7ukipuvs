CREATE OR REPLACE FUNCTION public.complete_user_migration(cust_id UUID, new_uid UUID)
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_email TEXT;
BEGIN
    -- 1. Get email from the customer record
    SELECT email INTO target_email FROM public.customers WHERE id = cust_id;

    -- 2. Force insert into public.users to satisfy foreign key immediately
    -- This prevents the 409/23503 error by ensuring the 'noivo' (user) is at the altar
    BEGIN
        INSERT INTO public.users (id, email, role)
        VALUES (new_uid, target_email, 'customer')
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Safely ignore if public.users table does not exist
    END;

    -- 3. Update the customer record
    UPDATE public.customers
    SET 
        user_id = new_uid,
        is_imported = FALSE,
        has_migrated = TRUE,
        updated_at = NOW()
    WHERE id = cust_id;
END;
$$;
