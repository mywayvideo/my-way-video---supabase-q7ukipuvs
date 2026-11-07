-- ==============================================================================
-- Migration: 20261107210000_fix_reviewer_columns_ignore_generated.sql
--
-- Corrige o gatilho enforce_reviewer_product_columns.
--
-- BUG QUE ESTA MIGRATION CORRIGE:
--   A versão anterior comparava OLD e NEW com
--     to_jsonb(OLD) - v_allowed  IS DISTINCT FROM  to_jsonb(NEW) - v_allowed
--   e recusava QUALQUER diferença. Só que products tem colunas GERADAS
--   (fts_vector, search_vector, search_text) que o próprio Postgres recalcula
--   em todo UPDATE. Elas sempre diferem entre OLD e NEW quando o produto muda
--   de categoria, então o gatilho barrava até a operação legítima — o revisor
--   não conseguia gravar nem a categoria.
--
-- CORREÇÃO:
--   Em vez de comparar "tudo menos o permitido", a lista passa a ser POSITIVA:
--   compara explicitamente cada coluna que NÃO pode mudar. Colunas geradas
--   ficam de fora naturalmente, porque não são colunas de dados editáveis.
--   Se uma coluna nova for criada no futuro, ela não entra nesta lista — e é
--   por isso que a policy de RLS continua sendo a primeira barreira; esta
--   função é a segunda (defesa em profundidade).
-- ==============================================================================

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

  IF NOT public.is_reviewer() THEN
    RAISE EXCEPTION 'Sem permissão para alterar produtos.'
      USING ERRCODE = '42501';
  END IF;

  -- Lista POSITIVA das colunas protegidas. Colunas geradas (fts_vector,
  -- search_vector, search_text) ficam de fora de propósito: o Postgres as
  -- recalcula e elas nunca devem barrar uma gravação legítima.
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

NOTIFY pgrst, 'reload schema';
