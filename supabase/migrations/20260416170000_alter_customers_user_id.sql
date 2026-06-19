DO $DO_BLOCK$
BEGIN
  -- Drop NOT NULL from user_id to allow importing legacy customers without an auth account
  ALTER TABLE public.customers ALTER COLUMN user_id DROP NOT NULL;
  
  -- Create unique constraint on email to allow for upserts
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_email_key'
  ) THEN
    -- First, clean up any existing duplicate emails to prevent constraint violation
    DELETE FROM public.customers
    WHERE id IN (
      SELECT id
      FROM (
        SELECT id,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY updated_at DESC) as rnum
        FROM public.customers
        WHERE email IS NOT NULL
      ) t
      WHERE t.rnum > 1
    );
    
    -- Add the unique constraint
    ALTER TABLE public.customers ADD CONSTRAINT customers_email_key UNIQUE (email);
  END IF;
END $DO_BLOCK$;
