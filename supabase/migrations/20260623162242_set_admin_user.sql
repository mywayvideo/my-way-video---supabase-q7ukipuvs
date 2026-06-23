DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Insert into auth.users if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@mywayvideo.com') THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@mywayvideo.com',
      crypt('Admin@Pass123!', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Admin My Way"}',
      false, 'authenticated', 'authenticated',
      '',    -- confirmation_token
      '',    -- recovery_token
      '',    -- email_change_token_new
      '',    -- email_change
      '',    -- email_change_token_current
      NULL,  -- phone
      '',    -- phone_change
      '',    -- phone_change_token
      ''     -- reauthentication_token
    );
  ELSE
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@mywayvideo.com' LIMIT 1;
  END IF;

  -- Ensure customers record exists and is set to admin
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE user_id = v_user_id) THEN
    INSERT INTO public.customers (
      id, user_id, email, full_name, role, status
    ) VALUES (
      gen_random_uuid(), v_user_id, 'admin@mywayvideo.com', 'Admin My Way', 'admin', 'ativo'
    );
  ELSE
    UPDATE public.customers
    SET role = 'admin'
    WHERE user_id = v_user_id;
  END IF;

  -- Ensure any existing nulls in auth.users tokens are fixed
  UPDATE auth.users
  SET
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, '')
  WHERE
    confirmation_token IS NULL OR recovery_token IS NULL
    OR email_change_token_new IS NULL OR email_change IS NULL
    OR email_change_token_current IS NULL
    OR phone_change IS NULL OR phone_change_token IS NULL
    OR reauthentication_token IS NULL;

END $$;
