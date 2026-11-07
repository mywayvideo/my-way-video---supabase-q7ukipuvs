-- ==============================================================================
-- Migration: 20261107203000_create_category_audit_log.sql
--
-- Trilha de auditoria das mudanças de categoria em public.products.
--
-- Por que existe:
--   O perfil 'reviewer' passa a poder gravar category_id/category em produtos.
--   Sem registro, um erro de classificação fica sem autor e sem data — não dá
--   para auditar o trabalho do revisor nem desfazer um lote errado.
--
-- O que registra:
--   Toda mudança de category_id ou category em products, para QUALQUER perfil
--   (admin, reviewer ou service_role). Guarda: quem, quando, de qual categoria
--   para qual, o rótulo de→para e o motivo opcional.
--
-- Como o motivo é informado:
--   O app pode enviar `set_config('app.audit_reason', '<texto>', true)` na
--   mesma transação do UPDATE. Se não enviar, fica nulo — o registro não
--   deixa de existir por falta de motivo.
--
-- Retenção: a tabela é append-only. Não há policy de UPDATE/DELETE para
-- ninguém além de service_role — nem o admin altera o histórico.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.category_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL,
  product_name  text,
  sku           text,
  changed_by    uuid,
  changed_email text,
  changed_role  text,
  category_id_from uuid,
  category_id_to   uuid,
  category_from text,
  category_to   text,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_audit_product
  ON public.category_audit_log (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_audit_created
  ON public.category_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_audit_user
  ON public.category_audit_log (changed_by, created_at DESC);

-- ------------------------------------------------------------------------------
-- Função de registro
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_product_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_email text;
  v_role  text;
BEGIN
  -- Só registra se a classificação realmente mudou
  IF NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.category  IS NOT DISTINCT FROM OLD.category THEN
    RETURN NEW;
  END IF;

  SELECT c.email, c.role
    INTO v_email, v_role
    FROM public.customers c
   WHERE c.user_id = v_user
   LIMIT 1;

  INSERT INTO public.category_audit_log (
    product_id, product_name, sku,
    changed_by, changed_email, changed_role,
    category_id_from, category_id_to,
    category_from, category_to,
    reason
  ) VALUES (
    NEW.id, NEW.name, NEW.sku,
    v_user,
    COALESCE(v_email, CASE WHEN v_user IS NULL THEN 'service_role' END),
    COALESCE(v_role,  CASE WHEN v_user IS NULL THEN 'service_role' END),
    OLD.category_id, NEW.category_id,
    OLD.category,    NEW.category,
    NULLIF(current_setting('app.audit_reason', true), '')
  );

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_log_product_category_change ON public.products;
CREATE TRIGGER trg_log_product_category_change
  AFTER UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.log_product_category_change();

-- ------------------------------------------------------------------------------
-- RLS: histórico é leitura para staff, escrita só pelo gatilho (service definer)
-- ------------------------------------------------------------------------------
ALTER TABLE public.category_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_audit_select_staff" ON public.category_audit_log;
CREATE POLICY "category_audit_select_staff" ON public.category_audit_log
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- Nenhuma policy de INSERT/UPDATE/DELETE para usuários: só o gatilho
-- (SECURITY DEFINER) grava, e nada apaga o histórico.

-- ------------------------------------------------------------------------------
-- Visão de apoio: últimas mudanças com nome legível da categoria
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_category_audit_recent AS
SELECT
  l.created_at,
  l.product_name,
  l.sku,
  COALESCE(cf.name, l.category_from) AS de,
  COALESCE(ct.name, l.category_to)   AS para,
  l.changed_email,
  l.changed_role,
  l.reason
FROM public.category_audit_log l
LEFT JOIN public.categories cf ON cf.id = l.category_id_from
LEFT JOIN public.categories ct ON ct.id = l.category_id_to
ORDER BY l.created_at DESC;

NOTIFY pgrst, 'reload schema';
