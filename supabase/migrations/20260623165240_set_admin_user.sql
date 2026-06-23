DO $$
DECLARE
  v_user_id uuid;
BEGIN
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
      crypt('Skip@Pass123!', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Admin MyWay"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  ELSE
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@mywayvideo.com' LIMIT 1;
  END IF;

  IF EXISTS (SELECT 1 FROM public.customers WHERE user_id = v_user_id) THEN
    UPDATE public.customers SET role = 'admin' WHERE user_id = v_user_id;
  ELSIF EXISTS (SELECT 1 FROM public.customers WHERE email = 'admin@mywayvideo.com') THEN
    UPDATE public.customers SET role = 'admin', user_id = v_user_id WHERE email = 'admin@mywayvideo.com';
  ELSE
    INSERT INTO public.customers (id, user_id, email, full_name, role)
    VALUES (gen_random_uuid(), v_user_id, 'admin@mywayvideo.com', 'Admin MyWay', 'admin');
  END IF;
END $$;
