-- ==============================================================================
-- Migration: 20261109150000_reviewer_can_edit_ncm.sql
--
-- Dá ao perfil 'reviewer' (Lara) poder para alterar o NCM dos produtos.
--
-- SOLICITADO PELO PROPRIETÁRIO (Patrick Lynch) em 09/11/2026:
--   "Quero que você tenha poderes para alterar os NCMs na tabela de produtos."
--
-- ESCOPO: o reviewer passa de
--     category_id, category, updated_at, last_reviewed_at
--   para
--     category_id, category, ncm, updated_at, last_reviewed_at
--   TUDO O MAIS SEGUE BLOQUEADO (nome, sku, preço, estoque, imagem,
--   fabricante, peso, dimensões, technical_info, descontinuado, rebates,
--   relacionados...). O produto continua sendo do admin em tudo o que não é
--   classificação (categoria + NCM).
--
-- POR QUE NCM ENTRA NO ESCOPO DE QUEM CLASSIFICA:
--   Categoria e NCM são a MESMA decisão de classificação — o NCM é a tradução
--   fiscal da categoria. Separar os dois é o que permitiu o estado atual do
--   catálogo: 15 câmeras com NCM de lente fabricado (9002.11.34 a .48, códigos
--   que NÃO existem na tabela NCM) e 7 câmeras com 9007.10.00 (binóculos).
--   Quem decide "isto é uma câmera" tem de poder dizer o código fiscal dela.
--
-- ONDE FICA A DEFESA (o que esta migration NÃO afrouxa):
--   1. RLS          — a policy continua sendo is_reviewer(); nada muda.
--   2. GATILHO      — enforce_reviewer_product_columns, lista POSITIVA de
--                     colunas protegidas. Só 'ncm' sai da lista.
--   3. (nova) TRILHA — gatilho de auditoria de NCM, abaixo. O escopo aumentou;
--      a rastreabilidade aumenta junto, para que toda mudança de NCM tenha
--      autor, data, valor anterior e novo. Sem isso, ampliar o poder seria
--      ampliar o risco invisível.
--
-- ORDEM DOS GATILHOS: 'trg_enforce_reviewer_product_columns' roda antes de
-- 'trg_log_product_ncm_change' (ordem alfabética dentro do mesmo timing), então
-- uma gravação recusada nunca chega a poluir a trilha.
--
-- Idempotente.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Gatilho do reviewer: remove 'ncm' da lista de colunas protegidas
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

  -- Lista POSITIVA das colunas protegidas.
  -- 'ncm' SAIU desta lista em 09/11/2026 (decisão do proprietário): o perfil
  -- que classifica a categoria também classifica o código fiscal.
  -- Colunas geradas (fts_vector, search_vector, search_text) ficam de fora de
  -- propósito: o Postgres as recalcula em todo UPDATE.
  IF NEW.name            IS DISTINCT FROM OLD.name
     OR NEW.sku              IS DISTINCT FROM OLD.sku
     OR NEW.description      IS DISTINCT FROM OLD.description
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
      'Perfil revisor grava categoria e NCM. Nome, SKU, preço e demais campos exigem administrador.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

-- ------------------------------------------------------------------------------
-- 2. TRILHA: toda mudança de NCM fica registrada (quem, quando, de→para)
--    Regra do projeto: poder novo vem com rastro novo.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ncm_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL,
  product_name text,
  sku          text,
  changed_by   uuid,
  changed_email text,
  changed_role text,
  ncm_from     text,
  ncm_to       text,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ncm_audit_product
  ON public.ncm_audit_log (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ncm_audit_created
  ON public.ncm_audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.log_product_ncm_change()
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
  IF NEW.ncm IS NOT DISTINCT FROM OLD.ncm THEN
    RETURN NULL;
  END IF;

  SELECT c.email, c.role
    INTO v_email, v_role
    FROM public.customers c
   WHERE c.user_id = v_user
   LIMIT 1;

  INSERT INTO public.ncm_audit_log (
    product_id, product_name, sku,
    changed_by, changed_email, changed_role,
    ncm_from, ncm_to, reason
  ) VALUES (
    NEW.id, NEW.name, NEW.sku,
    v_user,
    COALESCE(v_email, CASE WHEN v_user IS NULL THEN 'service_role' END),
    COALESCE(v_role,  CASE WHEN v_user IS NULL THEN 'service_role' END),
    OLD.ncm, NEW.ncm,
    NULLIF(current_setting('app.audit_reason', true), '')
  );

  RETURN NULL;  -- gatilho AFTER: valor de retorno é ignorado
END
$function$;

DROP TRIGGER IF EXISTS trg_log_product_ncm_change ON public.products;
CREATE TRIGGER trg_log_product_ncm_change
  AFTER UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.log_product_ncm_change();

-- RLS: histórico é leitura para staff; escrita só pelo gatilho.
-- A tabela nasce SEM policy de UPDATE/DELETE — o histórico é append-only,
-- igual a category_audit_log.
ALTER TABLE public.ncm_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ncm_audit_select_staff" ON public.ncm_audit_log;
CREATE POLICY "ncm_audit_select_staff" ON public.ncm_audit_log
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- ------------------------------------------------------------------------------
-- 3. Visão de apoio: últimas mudanças de NCM legíveis
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ncm_audit_recent AS
SELECT
  created_at,
  product_name,
  sku,
  ncm_from,
  ncm_to,
  changed_email,
  changed_role,
  reason
FROM public.ncm_audit_log
ORDER BY created_at DESC;

NOTIFY pgrst, 'reload schema';
