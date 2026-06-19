CREATE OR REPLACE FUNCTION public.complete_user_migration(cust_id uuid, new_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  user_exists BOOLEAN;
  retries INTEGER := 0;
BEGIN
  -- Wait up to 3 seconds for the user to appear in auth.users if necessary
  LOOP
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = new_uid) INTO user_exists;
    EXIT WHEN user_exists OR retries >= 3;
    PERFORM pg_sleep(1);
    retries := retries + 1;
  END LOOP;

  UPDATE public.customers
  SET 
    user_id = new_uid,
    is_imported = FALSE,
    has_migrated = TRUE,
    updated_at = NOW()
  WHERE id = cust_id;
END;
$function$;
