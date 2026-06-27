CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO public.app_settings (setting_key, setting_value, setting_value_numeric, updated_at)
VALUES
  ('shipping_sao_paulo_price_per_kg', '120', 120, NOW()),
  ('shipping_sao_paulo_percentage_value', '10', 10, NOW()),
  ('shipping_sao_paulo_additional_weight_kg', '0.5', 0.5, NOW()),
  ('shipping_usa_fixed_rate', '25', 25, NOW()),
  ('shipping_usa_price_per_lb', '1.5', 1.5, NOW()),
  ('shipping_usa_formula', '{"base_cost": 25.0, "weight_price_per_kg": 3.0, "value_percentage": 1.5}', NULL, NOW()),
  ('warehouse_location', '{"address": "1735 NW 79th Av., Doral, FL 33126", "latitude": 25.8067, "longitude": -80.2789, "zip_code": "33126"}', NULL, NOW()),
  ('shipping_miami_ranges', '[{"min_km": 0, "max_km": 15, "cost_usd": 25}, {"min_km": 15, "max_km": 30, "cost_usd": 35}, {"min_km": 30, "max_km": 50, "cost_usd": 50}]', NULL, NOW())
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = COALESCE(EXCLUDED.setting_value, app_settings.setting_value),
  setting_value_numeric = COALESCE(EXCLUDED.setting_value_numeric, app_settings.setting_value_numeric),
  updated_at = NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.app_settings
    WHERE setting_key = 'warehouse_location'
    AND setting_value NOT LIKE '%zip_code%'
  ) THEN
    UPDATE public.app_settings
    SET setting_value = '{"address": "1735 NW 79th Av., Doral, FL 33126", "latitude": 25.8067, "longitude": -80.2789, "zip_code": "33126"}',
        updated_at = NOW()
    WHERE setting_key = 'warehouse_location';
  END IF;
END $$;

DO $$
DECLARE
  new_user_id uuid;
BEGIN
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
      '{"name": "P. Lynch"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.customers (id, user_id, email, full_name, role, has_migrated, status)
    VALUES (gen_random_uuid(), new_user_id, 'plynchusa@gmail.com', 'P. Lynch', 'admin', true, 'ativo')
    ON CONFLICT (email) DO NOTHING;
  END IF;
END $$;
