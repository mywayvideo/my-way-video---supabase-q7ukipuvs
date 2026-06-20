CREATE OR REPLACE FUNCTION public.sync_current_user_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_email text;
    v_full_name text;
    v_customer_id uuid;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Extract from JWT
    v_email := auth.jwt() ->> 'email';
    v_full_name := auth.jwt() -> 'user_metadata' ->> 'full_name';
    
    -- Fallback for name if it's stored as 'name'
    IF v_full_name IS NULL THEN
        v_full_name := auth.jwt() -> 'user_metadata' ->> 'name';
    END IF;

    -- Upsert into customers table
    INSERT INTO public.customers (user_id, email, full_name, created_at, updated_at)
    VALUES (v_user_id, v_email, v_full_name, now(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET 
        email = COALESCE(EXCLUDED.email, public.customers.email),
        full_name = COALESCE(EXCLUDED.full_name, public.customers.full_name),
        updated_at = now()
    RETURNING id INTO v_customer_id;

    RETURN v_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_current_user_profile() TO authenticated, anon;
