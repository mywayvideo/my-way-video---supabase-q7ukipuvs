-- ==============================================================================
-- Migration: 20261108203000_cleanup_final_test_product.sql
--
-- Remove o produto de teste ZZFINAL001 criado na validação final do perfil
-- catalog_manager (versão 0.0.765).
--
-- Antes do DELETE, registra o ESTADO FINAL VERIFICADO das permissões em uma
-- tabela de log permanente — para que a evidência do teste não se perca com
-- a remoção do produto.
--
-- Critério verificável (SKU exato), nunca UUID digitado à mão.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_manager_validation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at   timestamptz NOT NULL DEFAULT now(),
  profile       text NOT NULL,
  checks        jsonb NOT NULL,
  catalog_total bigint NOT NULL
);

DO $$
DECLARE
  v_antes     bigint;
  v_removidos bigint;
  v_depois    bigint;
BEGIN
  SELECT count(*) INTO v_antes FROM public.products;

  DELETE FROM public.products WHERE sku = 'ZZFINAL001';
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  SELECT count(*) INTO v_depois FROM public.products;

  RAISE NOTICE 'Produtos: % -> % (removidos: %)', v_antes, v_depois, v_removidos;

  IF v_depois <> 1098 THEN
    RAISE EXCEPTION 'Contagem final inesperada: % (esperado 1098).', v_depois;
  END IF;

  IF EXISTS (SELECT 1 FROM public.products WHERE sku LIKE 'ZZ%' OR sku LIKE 'TESTE%') THEN
    RAISE EXCEPTION 'Sobrou produto de teste no catálogo.';
  END IF;

  -- Evidência permanente do que foi validado em 08/11/2026
  INSERT INTO public.catalog_manager_validation (profile, checks, catalog_total)
  VALUES (
    'catalog_manager',
    jsonb_build_object(
      'insert_produto',                'permitido',
      'update_price_usd',              'permitido',
      'update_descricao_specs_ncm',    'permitido',
      'update_categoria',              'permitido',
      'delete_produto',                'bloqueado (RLS: 200 com 0 linhas)',
      'insert_categoria',              'bloqueado (403)',
      'update_created_at',             'bloqueado (403)',
      'insert_sem_categoria',          'bloqueado (23502)',
      'insert_categoria_inexistente',  'bloqueado (23503)',
      'insert_nome_vazio',             'bloqueado (23502)',
      'insert_sem_sku',                'bloqueado (23502)',
      'insert_price_negativo',         'bloqueado (23514)',
      'reviewer_update_categoria',     'permitido (regressao corrigida)',
      'reviewer_update_price_usd',     'bloqueado (403)',
      'reviewer_insert_produto',       'bloqueado (403)'
    ),
    v_depois
  );
END $$;

ALTER TABLE public.catalog_manager_validation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "validation_select_admin" ON public.catalog_manager_validation;
CREATE POLICY "validation_select_admin" ON public.catalog_manager_validation
  FOR SELECT TO authenticated USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
