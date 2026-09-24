-- Migration: restore admin user profile in public.customers
-- The user admin@mywayvideo.com was moved to customers_staging due to check_spam_email detecting 'admin' prefix.
-- Also update check_spam_email/cleanup_spam_customers to exempt admin@mywayvideo.com from being flagged as spam.

-- 1. Update check_spam_email to exempt admin@mywayvideo.com
CREATE OR REPLACE FUNCTION public.check_spam_email(p_email TEXT)
RETURNS TABLE(is_spam BOOLEAN, is_borderline BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_local TEXT;
  v_at_pos INT;
  v_dot_count INT;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN QUERY SELECT true, false, 'Empty Email'::TEXT;
    RETURN;
  END IF;

  v_at_pos := POSITION('@' IN p_email);
  IF v_at_pos = 0 THEN
    RETURN QUERY SELECT true, false, 'Invalid Email Format'::TEXT;
    RETURN;
  END IF;

  v_local := LOWER(SUBSTRING(p_email FROM 1 FOR v_at_pos - 1));

  -- Exemption: official company admin email
  IF LOWER(p_email) = 'admin@mywayvideo.com' THEN
    RETURN QUERY SELECT false, false, NULL::TEXT;
    RETURN;
  END IF;

  -- Rule 1: Standard regex format validation
  IF p_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RETURN QUERY SELECT true, false, 'Invalid Email Format'::TEXT;
    RETURN;
  END IF;

  -- Rule 2: Generic prefixes (test, random, user, admin, support)
  IF v_local ~ '^(test|random|user|admin|support)' THEN
    RETURN QUERY SELECT true, false, 'Invalid Email Prefix'::TEXT;
    RETURN;
  END IF;

  -- Rule 3: More than 4 consecutive digits in local part
  IF v_local ~ '[0-9]{5,}' THEN
    RETURN QUERY SELECT true, false, 'Excessive Digits in Email'::TEXT;
    RETURN;
  END IF;

  -- Rule 4: More than 2 dots in local part
  v_dot_count := LENGTH(v_local) - LENGTH(REPLACE(v_local, '.', ''));
  IF v_dot_count > 2 THEN
    RETURN QUERY SELECT true, false, 'Excessive Dots in Email'::TEXT;
    RETURN;
  END IF;

  -- Borderline checks (suspicious but not definitive)
  IF v_local ~ '[0-9]{3,}' THEN
    RETURN QUERY SELECT false, true, 'Borderline: Multiple Consecutive Digits'::TEXT;
    RETURN;
  END IF;

  IF v_dot_count = 2 THEN
    RETURN QUERY SELECT false, true, 'Borderline: Multiple Dots'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, false, NULL::TEXT;
END;
$$;

-- 2. Insert or update customer profile for admin@mywayvideo.com
DO $$
DECLARE
  v_user_id uuid := '3952953b-b488-41ef-8856-c1a42e0f6a6c'::uuid;
  v_email text := 'admin@mywayvideo.com';
  v_staging_record record;
BEGIN
  -- Verify if auth user exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    -- Get data from staging if exists
    SELECT * INTO v_staging_record FROM public.customers_staging WHERE user_id = v_user_id OR email = v_email LIMIT 1;

    IF EXISTS (SELECT 1 FROM public.customers WHERE email = v_email) THEN
      UPDATE public.customers
      SET user_id = v_user_id,
          role = 'admin',
          status = 'ativo'
      WHERE email = v_email;
    ELSIF EXISTS (SELECT 1 FROM public.customers WHERE user_id = v_user_id) THEN
      UPDATE public.customers
      SET email = v_email,
          role = 'admin',
          status = 'ativo'
      WHERE user_id = v_user_id;
    ELSE
      -- Insert using existing ID from staging if available, or generate a new UUID
      IF v_staging_record.id IS NOT NULL THEN
        INSERT INTO public.customers (
          id, user_id, full_name, email, role, status, phone, gender, profile_photo_url, has_migrated
        ) VALUES (
          v_staging_record.id,
          v_user_id,
          COALESCE(v_staging_record.full_name, 'Admin'),
          v_email,
          'admin',
          'ativo',
          v_staging_record.phone,
          v_staging_record.gender,
          v_staging_record.profile_photo_url,
          true
        )
        ON CONFLICT (user_id) DO UPDATE SET
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          status = EXCLUDED.status;
      ELSE
        INSERT INTO public.customers (
          user_id, full_name, email, role, status, has_migrated
        ) VALUES (
          v_user_id,
          'Admin',
          v_email,
          'admin',
          'ativo',
          true
        )
        ON CONFLICT (user_id) DO UPDATE SET
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          status = EXCLUDED.status;
      END IF;
    END IF;

    -- Clean up staging row for this admin user
    DELETE FROM public.customers_staging WHERE user_id = v_user_id OR email = v_email;
  END IF;
END $$;
