CREATE OR REPLACE FUNCTION public.complete_user_migration(cust_id uuid, new_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Ensure the user record exists in public.users to satisfy the foreign key constraint
  -- This prevents the 23503 error without using pg_sleep (avoiding 500 timeouts)
  BEGIN
    INSERT INTO public.users (id, email, role)
    SELECT id, email, 'customer'
    FROM auth.users 
    WHERE id = new_uid
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore if public.users doesn't exist or isn't used
  END;

  -- Perform the link
  UPDATE public.customers
  SET 
    user_id = new_uid,
    is_imported = FALSE,
    has_migrated = TRUE,
    updated_at = NOW()
  WHERE id = cust_id;
END;
$function$;
