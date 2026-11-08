-- ==============================================================================
-- Migration: 20261108201000_fix_catalog_manager_trigger_blocks_reviewer.sql
--
-- CORRIGE UMA REGRESSÃO QUE EU INTRODUZI na migration 20261108190000.
--
-- O QUE QUEBROU:
--   O gatilho enforce_catalog_manager_columns, criado para validar o perfil
--   catalog_manager, roda em TODO UPDATE de products e fazia:
--
--       IF NOT public.is_catalog_manager() THEN
--         RAISE EXCEPTION 'Sem permissão para alterar produtos.';
--       END IF;
--
--   Sem uma saída para o reviewer, ele passou a ser recusado ANTES de chegar
--   ao seu próprio gatilho. Efeito medido no teste de 08/11/2026 20:05:
--     reviewer UPDATE categoria -> HTTP 403 (antes da correção: OK)
--   Ou seja: o perfil de revisão perdeu a função principal dele — confirmar
--   categoria — por causa de um gatilho que não era dele.
--
-- CORREÇÃO:
--   O gatilho do catalog_manager só deve julgar o catalog_manager. Para os
--   demais perfis ele passa adiante e deixa o gatilho do reviewer
--   (enforce_reviewer_product_columns) fazer o seu trabalho. É o desenho
--   correto: cada gatilho cuida do seu papel.
--
-- REGRA QUE FICA: ao criar um gatilho global em uma tabela com vários papéis,
--   sempre prever a saída explícita para os outros papéis.
--
-- Inclui também a limpeza do produto de teste ZZPERM001.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Gatilho do catalog_manager com saída para os outros perfis
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

  -- O reviewer tem regras próprias, aplicadas por
  -- enforce_reviewer_product_columns. Não é assunto deste gatilho.
  IF public.is_reviewer() THEN
    RETURN NEW;
  END IF;

  -- Daqui para baixo: só o catalog_manager segue adiante.
  IF NOT public.is_catalog_manager() THEN
    RAISE EXCEPTION 'Sem permissão para alterar produtos.'
      USING ERRCODE = '42501';
  END IF;

  -- Colunas de sistema imutáveis para este perfil
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Perfil catalog_manager não altera id nem created_at.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

-- ------------------------------------------------------------------------------
-- 2. Limpeza do produto de teste, com verificação
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_antes     bigint;
  v_removidos bigint;
  v_depois    bigint;
BEGIN
  SELECT count(*) INTO v_antes FROM public.products;

  DELETE FROM public.products WHERE sku = 'ZZPERM001';
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  SELECT count(*) INTO v_depois FROM public.products;

  RAISE NOTICE 'Produtos: % -> % (removidos: %)', v_antes, v_depois, v_removidos;

  IF v_depois <> 1098 THEN
    RAISE EXCEPTION 'Contagem final inesperada: % (esperado 1098).', v_depois;
  END IF;

  IF EXISTS (SELECT 1 FROM public.products
              WHERE sku LIKE 'ZZ%' OR sku LIKE 'TESTE%') THEN
    RAISE EXCEPTION 'Sobrou produto de teste no catálogo.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
