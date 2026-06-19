ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'suspenso'));
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;

UPDATE public.customers c
SET email = u.email
FROM auth.users u
WHERE c.user_id = u.id AND c.email IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.customers (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
