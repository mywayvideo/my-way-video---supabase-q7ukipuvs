DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Insert app settings for legal pages and social links
  INSERT INTO public.app_settings (setting_key, setting_value)
  VALUES
    ('social_instagram', 'https://www.instagram.com/mywayvideopro/'),
    ('social_facebook', 'https://www.facebook.com/MyWayVideoPro'),
    ('company_admin_email', 'admin@mywayvideo.com')
  ON CONFLICT (setting_key) DO NOTHING;

  -- Seed admin user for testing
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'plynchusa@gmail.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'plynchusa@gmail.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Admin"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  END IF;
END $$;
