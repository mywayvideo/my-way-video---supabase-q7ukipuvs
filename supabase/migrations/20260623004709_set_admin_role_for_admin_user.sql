DO $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Encontrar o ID do usuário admin
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = 'admin@mywayvideo.com'
  LIMIT 1;

  -- Atualizar a tabela customers para definir o papel como admin
  IF target_user_id IS NOT NULL THEN
    UPDATE public.customers
    SET role = 'admin'
    WHERE user_id = target_user_id;
  END IF;
END $$;
