-- ==============================================================================
-- Migration: 20261108190000_create_catalog_manager_role.sql
--
-- Cria o perfil 'catalog_manager' (Gestor de Catálogo) e sua conta de serviço.
--
-- SOLICITADO PELO PROPRIETÁRIO (Patrick Lynch) em 08/11/2026:
--   "Crie o perfil catalog_manager incluindo a gravação e edição do preço de
--    venda do produto (price_usd), que deve ser sempre exatamente o mesmo
--    preço de venda que a B&H utiliza."
--
-- POR QUE UM PERFIL NOVO, E NÃO AMPLIAR O 'reviewer':
--   O 'reviewer' foi desenhado para UMA responsabilidade: classificar categoria,
--   com auditoria dedicada. Ampliá-lo para cadastro inteiro misturaria duas
--   funções e enfraqueceria a garantia construída em 07/11. Separação de papéis:
--     reviewer        → categoria (escopo mínimo, auditado)
--     catalog_manager → cadastro de catálogo (este perfil)
--     admin           → tudo, inclusive excluir produto e mexer em categorias
--
-- ESCOPO CONCEDIDO AO catalog_manager (por decisão do proprietário):
--   PODE gravar em products:
--     name, sku, description, ncm, price_usd, price_cost, stock,
--     image_url, manufacturer_id, weight, dimensions, technical_info,
--     website_url, category_id, category, is_special, is_discontinued,
--     price_usa_rebate, price_cost_rebate, date_rebate,
--     price_nationalized_sales, price_nationalized_cost,
--     price_nationalized_currency, manual_related_ids, ai_related_ids,
--     ai_related_meta, rejected_related_ids, ncm_audit_id,
--     price_brl, updated_at, last_reviewed_at
--
--   NÃO PODE:
--     * INSERT  — cadastrar produto novo continua sendo ato de admin
--                 (o formulário de novo produto exige INSERT)
--     * DELETE  — excluir produto é sempre do admin
--     * CREATE/UPDATE/DELETE em categories
--
-- SOBRE O price_brl:
--   price_brl é coluna derivada do câmbio e do price_usd (recalculada por
--   gatilho/rotina da aplicação). Liberamos a escrita porque sem ela o
--   formulário de edição falha ao salvar; a aplicação recalcula o valor.
--
-- REGRA DE NEGÓCIO DO price_usd (não é imposta pelo banco, é operacional):
--   price_usd deve ser SEMPRE igual ao preço de venda da B&H para o produto.
--   Verificação em 3 camadas documentada em docs/criterios-catalogo.md.
--
-- DEFESA EM DUAS CAMADAS (mesma arquitetura do reviewer):
--   1. RLS     — policies separadas por papel.
--   2. TRIGGER — lista POSITIVA de colunas; recusa qualquer diferença fora dela.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Função de papel
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_catalog_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.customers
    WHERE user_id = auth.uid() AND role = 'catalog_manager'
  );
END;
$function$;

-- is_staff passa a incluir o gestor de catálogo (leitura ampliada no admin)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_admin() OR public.is_reviewer() OR public.is_catalog_manager();
$function$;

-- ------------------------------------------------------------------------------
-- 2. CHECK de role: incluir catalog_manager
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.customers'::regclass
       AND conname  = 'customers_role_check'
  ) THEN
    ALTER TABLE public.customers DROP CONSTRAINT customers_role_check;
  END IF;

  ALTER TABLE public.customers
    ADD CONSTRAINT customers_role_check
    CHECK (role IS NULL OR role IN ('admin', 'reviewer', 'catalog_manager', 'customer'));
END $$;

-- ------------------------------------------------------------------------------
-- 3. RLS em products: UPDATE para o catalog_manager
--    (INSERT e DELETE continuam exclusivos do admin — nenhuma policy é criada)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "products_update_catalog_manager" ON public.products;
CREATE POLICY "products_update_catalog_manager" ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_catalog_manager())
  WITH CHECK (public.is_catalog_manager());

-- ------------------------------------------------------------------------------
-- 4. Gatilho de colunas: lista POSITIVA para o catalog_manager
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_catalog_manager_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role, migrations (auth.uid() nulo) e admin: sem restrição
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_catalog_manager() THEN
    RAISE EXCEPTION 'Sem permissão para alterar produtos.'
      USING ERRCODE = '42501';
  END IF;

  -- Colunas PROTEGIDAS: qualquer mudança barra a operação.
  -- Colunas geradas (fts_vector, search_vector, search_text) ficam de fora
  -- de propósito: o Postgres as recalcula em todo UPDATE e elas nunca devem
  -- barrar uma gravação legítima.
  IF NEW.id           IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Perfil catalog_manager não altera id nem created_at.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_enforce_catalog_manager_columns ON public.products;
CREATE TRIGGER trg_enforce_catalog_manager_columns
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_catalog_manager_columns();

-- ------------------------------------------------------------------------------
-- 4b. IMPORTANTE: o gatilho do revisor precisa deixar o catalog_manager passar.
--     O gatilho enforce_reviewer_product_columns roda em TODO UPDATE e faz
--     "IF NOT is_reviewer() THEN RAISE EXCEPTION". Sem esta correção, o
--     catalog_manager seria recusado por ele antes mesmo de chegar ao seu
--     próprio gatilho. Reescrito com passagem explícita para os dois papéis.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_reviewer_product_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role, migrations (auth.uid() nulo) e admin: sem restrição
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- o gestor de catálogo tem escopo próprio e é validado pelo seu gatilho
  IF public.is_catalog_manager() THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_reviewer() THEN
    RAISE EXCEPTION 'Sem permissão para alterar produtos.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.name            IS DISTINCT FROM OLD.name
     OR NEW.sku              IS DISTINCT FROM OLD.sku
     OR NEW.description      IS DISTINCT FROM OLD.description
     OR NEW.ncm              IS DISTINCT FROM OLD.ncm
     OR NEW.price_brl        IS DISTINCT FROM OLD.price_brl
     OR NEW.price_usd        IS DISTINCT FROM OLD.price_usd
     OR NEW.price_cost       IS DISTINCT FROM OLD.price_cost
     OR NEW.stock            IS DISTINCT FROM OLD.stock
     OR NEW.image_url        IS DISTINCT FROM OLD.image_url
     OR NEW.manufacturer_id  IS DISTINCT FROM OLD.manufacturer_id
     OR NEW.weight           IS DISTINCT FROM OLD.weight
     OR NEW.dimensions       IS DISTINCT FROM OLD.dimensions
     OR NEW.is_special       IS DISTINCT FROM OLD.is_special
     OR NEW.is_discontinued  IS DISTINCT FROM OLD.is_discontinued
     OR NEW.technical_info   IS DISTINCT FROM OLD.technical_info
     OR NEW.website_url      IS DISTINCT FROM OLD.website_url
     OR NEW.price_nationalized_sales    IS DISTINCT FROM OLD.price_nationalized_sales
     OR NEW.price_nationalized_cost     IS DISTINCT FROM OLD.price_nationalized_cost
     OR NEW.price_nationalized_currency IS DISTINCT FROM OLD.price_nationalized_currency
     OR NEW.price_usa_rebate IS DISTINCT FROM OLD.price_usa_rebate
     OR NEW.price_cost_rebate IS DISTINCT FROM OLD.price_cost_rebate
     OR NEW.date_rebate      IS DISTINCT FROM OLD.date_rebate
     OR NEW.manual_related_ids IS DISTINCT FROM OLD.manual_related_ids
     OR NEW.ai_related_ids   IS DISTINCT FROM OLD.ai_related_ids
     OR NEW.ai_related_meta  IS DISTINCT FROM OLD.ai_related_meta
     OR NEW.rejected_related_ids IS DISTINCT FROM OLD.rejected_related_ids
     OR NEW.ncm_audit_id     IS DISTINCT FROM OLD.ncm_audit_id
  THEN
    RAISE EXCEPTION
      'Perfil revisor grava apenas a categoria do produto. NCM, preço, nome e demais campos exigem administrador.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

-- ------------------------------------------------------------------------------
-- 5. Conta de serviço do gestor de catálogo
--    Senha aleatória de 24 caracteres, entregue ao proprietário na conversa.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_email   text := 'lara.catalogo@mywayvideo.com';
  v_name    text := 'Lara Catalogo';
  -- bcrypt (custo 10) da senha gerada em 08/11/2026
  v_hash    text := '$2b$10$8gTJhkuvK9cg8.Nzybzsvu1VHBkOxoIK4l4m8dK3XUQYDPaWFd8qe';
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
    UPDATE auth.users
       SET encrypted_password = v_hash,
           email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
           updated_at = NOW()
     WHERE id = v_user_id;
  END IF;

  SELECT id INTO v_cust_id FROM public.customers WHERE user_id = v_user_id LIMIT 1;

  IF v_cust_id IS NULL THEN
    INSERT INTO public.customers (id, user_id, email, full_name, role, status)
    VALUES (gen_random_uuid(), v_user_id, v_email, v_name, 'catalog_manager', 'ativo');
  ELSE
    UPDATE public.customers
       SET email = v_email,
           full_name = COALESCE(NULLIF(full_name, ''), v_name),
           role = 'catalog_manager',
           status = 'ativo'
     WHERE id = v_cust_id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
