DO $$
DECLARE
  v_admin_id uuid;
  v_support_id uuid;
BEGIN
  -- Seed admin user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@mywayvideo.com') THEN
    v_admin_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@mywayvideo.com',
      crypt('admin@123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Admin"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@mywayvideo.com';
    UPDATE auth.users SET encrypted_password = crypt('admin@123', gen_salt('bf')), email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE id = v_admin_id;
  END IF;

  -- Upsert customer record
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE user_id = v_admin_id) THEN
    -- If there's an existing customer with this email but different user_id (unlikely but possible), delete or update it.
    DELETE FROM public.customers WHERE email = 'admin@mywayvideo.com' AND user_id IS NULL;
    
    INSERT INTO public.customers (id, user_id, email, full_name, role, has_migrated)
    VALUES (gen_random_uuid(), v_admin_id, 'admin@mywayvideo.com', 'Admin My Way Video', 'admin', true)
    ON CONFLICT (email) DO UPDATE SET role = 'admin', has_migrated = true, user_id = v_admin_id;
  ELSE
    UPDATE public.customers SET role = 'admin', has_migrated = true, email = 'admin@mywayvideo.com' WHERE user_id = v_admin_id;
  END IF;


  -- Seed support user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'plynchusa@gmail.com') THEN
    v_support_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_support_id,
      '00000000-0000-0000-0000-000000000000',
      'plynchusa@gmail.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Support"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_support_id FROM auth.users WHERE email = 'plynchusa@gmail.com';
    UPDATE auth.users SET encrypted_password = crypt('Skip@Pass', gen_salt('bf')), email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE id = v_support_id;
  END IF;

  -- Upsert customer record
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE user_id = v_support_id) THEN
    DELETE FROM public.customers WHERE email = 'plynchusa@gmail.com' AND user_id IS NULL;

    INSERT INTO public.customers (id, user_id, email, full_name, role, has_migrated)
    VALUES (gen_random_uuid(), v_support_id, 'plynchusa@gmail.com', 'Support My Way Video', 'admin', true)
    ON CONFLICT (email) DO UPDATE SET role = 'admin', has_migrated = true, user_id = v_support_id;
  ELSE
    UPDATE public.customers SET role = 'admin', has_migrated = true, email = 'plynchusa@gmail.com' WHERE user_id = v_support_id;
  END IF;

END $$;
