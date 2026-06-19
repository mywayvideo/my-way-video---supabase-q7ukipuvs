CREATE OR REPLACE FUNCTION public.sync_current_user_profile()
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.customers
    SET 
        user_id = auth.uid(),
        has_migrated = TRUE,
        is_imported = FALSE,
        updated_at = NOW()
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND (user_id IS NULL OR user_id != auth.uid());
END;
$$;
