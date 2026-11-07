-- ==============================================================================
-- Migration: 20261107201500_allow_reviewer_category_update.sql
--
-- Corrige o escopo do perfil 'reviewer' definido em 20261107190000.
--
-- PROBLEMA QUE ESTA MIGRATION CORRIGE:
--   A migration anterior negou TODO UPDATE em public.products para o reviewer.
--   Só que confirmar a categoria de um produto É um UPDATE em products
--   (category_id + category + updated_at + last_reviewed_at). Resultado: o
--   revisor ficava sem conseguir executar a própria função — confirmar a
--   categoria na fila de triagem, trocar a categoria na tabela e fazer
--   migração em massa.
--
-- ESCOPO APROVADO PELO PROPRIETÁRIO EM 07/11/2026:
--   "Só categoria" — o revisor grava exclusivamente category_id e category
--   (e os carimbos de auditoria updated_at / last_reviewed_at).
--   NCM, preço, nome, estoque e qualquer outra coluna continuam exigindo
--   administrador.
--
-- DEFESA EM DUAS CAMADAS (uma não substitui a outra):
--   1. RLS     — policy de UPDATE em products para is_reviewer().
--   2. TRIGGER — compara OLD x NEW coluna a coluna e recusa qualquer diferença
--                fora da lista permitida. Continua valendo mesmo que uma policy
--                permissiva seja criada no futuro por engano.
--
-- A lista de colunas permitidas é comparada via jsonb (to_jsonb(OLD) - permitidas),
-- então colunas novas na tabela entram automaticamente como PROIBIDAS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RLS: permitir UPDATE de produtos para o perfil revisor
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "products_update_reviewer" ON public.products;
CREATE POLICY "products_update_reviewer" ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_reviewer())
  WITH CHECK (public.is_reviewer());

-- ------------------------------------------------------------------------------
-- 2. Gatilho: travar a LINHA e liberar apenas as COLUNAS de classificação
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_reviewer_product_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- única lista de colunas que o revisor pode alterar (escopo aprovado)
  v_allowed text[] := ARRAY['category_id', 'category', 'updated_at', 'last_reviewed_at'];
  v_old jsonb;
  v_new jsonb;
BEGIN
  -- service_role, migrations (auth.uid() nulo) e admin: sem restrição
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_reviewer() THEN
    RAISE EXCEPTION 'Sem permissão para alterar produtos.'
      USING ERRCODE = '42501';
  END IF;

  v_old := to_jsonb(OLD) - v_allowed;
  v_new := to_jsonb(NEW) - v_allowed;

  IF v_old IS DISTINCT FROM v_new THEN
    RAISE EXCEPTION
      'Perfil revisor grava apenas a categoria do produto. NCM, preço, nome e demais campos exigem administrador.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_enforce_reviewer_product_columns ON public.products;
CREATE TRIGGER trg_enforce_reviewer_product_columns
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_reviewer_product_columns();

-- ------------------------------------------------------------------------------
-- 3. Recarregar schema do PostgREST
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
