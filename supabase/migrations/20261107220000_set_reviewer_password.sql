-- ==============================================================================
-- Migration: 20261107220000_set_reviewer_password.sql
--
-- Define a senha da conta da revisora conforme instrução do proprietário.
-- A senha é do proprietário — a revisora apenas a utiliza; não a define.
--
-- Hash bcrypt (custo 10) gerado a partir da senha informada em 07/11/2026.
-- ==============================================================================

DO $$
DECLARE
  v_email   text := 'lara.revisora@mywayvideo.com';
  v_hash    text := '$2b$10$3wtKYHcSAY2AjXpGWdhHhu8m/roy3A4EQKWQ/ETUnVU8V1TV225e6';
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Conta da revisora não encontrada: %', v_email;
  END IF;

  UPDATE auth.users
     SET encrypted_password = v_hash,
         email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
         updated_at = NOW()
   WHERE id = v_user_id;
END $$;
