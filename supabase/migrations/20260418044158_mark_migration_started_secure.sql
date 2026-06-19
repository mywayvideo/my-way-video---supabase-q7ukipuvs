CREATE OR REPLACE FUNCTION public.mark_migration_started(target_email TEXT)
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.customers
    SET 
        is_imported = FALSE,
        has_migrated = TRUE,
        updated_at = NOW()
    WHERE email = target_email;
END;
$$;
