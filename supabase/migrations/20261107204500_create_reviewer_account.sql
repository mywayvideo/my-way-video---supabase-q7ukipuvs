-- ==============================================================================
-- Migration: 20261107204500_create_reviewer_account.sql
--
-- Cria a conta de serviço da revisora (Lara) com perfil 'reviewer'.
--
-- Credencial:
--   e-mail : lara.revisora@mywayvideo.com
--   senha  : definida pelo proprietário na entrega — hash bcrypt abaixo
--   role   : reviewer (NUNCA admin)
--
-- Salvaguardas:
--   * e-mail já confirmado (email_confirmed_at), para poder autenticar sem
--     depender do envio de e-mail (mailer_autoconfirm está desligado).
--   * o trigger trg_prevent_role_escalation impede a própria conta de virar
--     admin depois.
--   * o registro em public.customers é o que as funções is_reviewer()/is_staff()
--     consultam — é ele que dá (e limita) o acesso.
--
-- Idempotente: se a conta já existir, apenas garante o papel e o vínculo.
-- ==============================================================================

DO $$
DECLARE
  v_email   text := 'lara.revisora@mywayvideo.com';
  -- Nome em ASCII simples: o gatilho validate_customer_signup recusa
  -- caracteres "incomuns" (travessão, acentos) no full_name do cadastro.
  v_name    text := 'Lara Revisora';
  -- bcrypt (custo 10) da senha entregue ao proprietário
  v_hash    text := '$2b$10$r9L1h/wL21ndbMxws0MFtuLj0tjiTAyfj/f2o4VSoUkYMb13WMZ.e';
  v_user_id uuid;
  v_cust_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NULL THEN
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
      v_email,
      v_hash,
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('name', v_name),
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  ELSE
    -- conta existente: garante a senha e o e-mail confirmado
    UPDATE auth.users
       SET encrypted_password = v_hash,
           email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
           updated_at = NOW()
     WHERE id = v_user_id;
  END IF;

  -- Vínculo em customers com o papel restrito
  SELECT id INTO v_cust_id FROM public.customers WHERE user_id = v_user_id LIMIT 1;

  IF v_cust_id IS NULL THEN
    INSERT INTO public.customers (id, user_id, email, full_name, role, status)
    VALUES (gen_random_uuid(), v_user_id, v_email, v_name, 'reviewer', 'ativo');
  ELSE
    UPDATE public.customers
       SET email = v_email,
           full_name = COALESCE(NULLIF(full_name, ''), v_name),
           role = 'reviewer',
           status = 'ativo'
     WHERE id = v_cust_id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
