-- ==============================================================================
-- Migration: 20261107190000_add_reviewer_role_and_restrict_category_crud.sql
--
-- Objetivo: criar o perfil 'reviewer' (Revisor de Categorias e NCMs) e impedir
-- TECNICAMENTE que ele grave em public.categories e public.products.
--
-- O QUE O PERFIL 'reviewer' PODE:
--   * SELECT em categories e products (revisar, filtrar, exportar listas).
--   * Nada de INSERT/UPDATE/DELETE em categories.
--   * Nada de INSERT/UPDATE/DELETE em products.
--
-- O QUE SÓ O PERFIL 'admin' PODE:
--   * Todo o CRUD de categories (criar, renomear, alterar acceptable_ncms,
--     desativar, excluir) e toda a escrita em products.
--
-- Contexto do problema que esta migration corrige:
--   A policy "Enable INSERT/UPDATE/DELETE for authenticated users" em
--   public.categories concedia escrita a QUALQUER usuário autenticado
--   (WITH CHECK true) — inclusive a um cliente da loja. O botão "Nova
--   Categoria" da UI era apenas cosmético: o banco aceitava a operação de
--   qualquer sessão autenticada.
--
-- Enforcement em profundidade:
--   1. Função public.is_admin() / public.is_reviewer() — fonte única do papel.
--   2. Policies RLS por comando e por papel.
--   3. Trigger que impede escalada de privilégio (reviewer virar admin).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Funções de papel
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.customers
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_reviewer()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.customers
    WHERE user_id = auth.uid() AND role = 'reviewer'
  );
END;
$function$;

-- Admin ou reviewer: base para políticas de leitura ampliada no admin.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_admin() OR public.is_reviewer();
$function$;

-- ------------------------------------------------------------------------------
-- 2. Impedir escalada de privilégio na própria tabela customers
-- ------------------------------------------------------------------------------
-- Sem este trigger, o reviewer usaria a policy "user_update_own_customer"
-- (auth.uid() = user_id) para trocar o próprio role para 'admin' e escapar
-- de todo o bloqueio.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- auth.uid() nulo = service_role / migration / edge function: permitido.
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION
        'Alteração de perfil (role) não permitida para este usuário.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.customers;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ------------------------------------------------------------------------------
-- 3. CATEGORIES — leitura pública, escrita exclusiva do admin
-- ------------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Policies legadas que davam escrita a qualquer autenticado
DROP POLICY IF EXISTS "Enable INSERT for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable UPDATE for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable DELETE for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Admin Full Access" ON public.categories;
DROP POLICY IF EXISTS "Public Read" ON public.categories;

DROP POLICY IF EXISTS "categories_select_public" ON public.categories;
CREATE POLICY "categories_select_public" ON public.categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "categories_insert_admin" ON public.categories;
CREATE POLICY "categories_insert_admin" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "categories_update_admin" ON public.categories;
CREATE POLICY "categories_update_admin" ON public.categories
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "categories_delete_admin" ON public.categories;
CREATE POLICY "categories_delete_admin" ON public.categories
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. PRODUCTS — leitura pública, escrita exclusiva do admin
-- ------------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access" ON public.products;
DROP POLICY IF EXISTS "Public Access 2" ON public.products;
DROP POLICY IF EXISTS "products_select_public" ON public.products;

DROP POLICY IF EXISTS "products_select_public_new" ON public.products;
CREATE POLICY "products_select_public_new" ON public.products
  FOR SELECT USING (true);

-- admin: acesso total (preserva o comportamento atual do app)
DROP POLICY IF EXISTS "products_write_admin" ON public.products;
CREATE POLICY "products_write_admin" ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- reviewer: nenhuma policy de INSERT/UPDATE/DELETE é criada de propósito.
-- Com RLS habilitado e sem policy permissiva, o PostgREST devolve 0 linhas
-- afetadas / erro de permissão em vez de gravar.

-- ------------------------------------------------------------------------------
-- 5. Recarregar o schema do PostgREST
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
