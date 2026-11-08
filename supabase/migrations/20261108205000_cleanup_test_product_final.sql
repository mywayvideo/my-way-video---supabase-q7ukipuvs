-- ==============================================================================
-- Migration: 20261108205000_cleanup_test_product_final.sql
--
-- Remove o produto de teste ZZFINAL001, criado para validar as permissões do
-- perfil catalog_manager e que ficou no catálogo porque o build estava
-- quebrado (o JSX de AdminCatalogPage.tsx impedia a migration de rodar).
--
-- Critério verificável: SKU exato. Nunca UUID digitado à mão.
-- Salvaguarda: aborta se a contagem final não for 1098.
-- ==============================================================================

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
END $$;

NOTIFY pgrst, 'reload schema';
