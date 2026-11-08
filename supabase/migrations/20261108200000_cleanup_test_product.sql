-- ==============================================================================
-- Migration: 20261108200000_cleanup_test_product.sql
--
-- Remove o produto de teste ZZTESTELARA001 criado durante a validação do
-- INSERT do perfil catalog_manager (versão 0.0.762/0.0.763).
--
-- Critério verificável: SKU exato 'ZZTESTELARA001'. Nunca UUID digitado.
-- Salvaguarda: aborta se o número de linhas removidas não for exatamente 1.
-- ==============================================================================

DO $$
DECLARE
  v_antes     bigint;
  v_removidos bigint;
  v_depois    bigint;
BEGIN
  SELECT count(*) INTO v_antes FROM public.products;

  DELETE FROM public.products WHERE sku = 'ZZTESTELARA001';
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  SELECT count(*) INTO v_depois FROM public.products;

  RAISE NOTICE 'Produtos: % -> % (removidos: %)', v_antes, v_depois, v_removidos;

  IF v_removidos <> 1 THEN
    RAISE EXCEPTION 'Esperava remover exatamente 1 produto de teste, removi %.', v_removidos;
  END IF;

  IF v_depois <> 1098 THEN
    RAISE EXCEPTION 'Contagem final inesperada: % (esperado 1098).', v_depois;
  END IF;

  -- Nenhum resíduo de teste pode sobrar
  IF EXISTS (
    SELECT 1 FROM public.products
     WHERE sku LIKE 'ZZTESTE%' OR sku LIKE 'ZZPROBE%'
  ) THEN
    RAISE EXCEPTION 'Sobrou produto de teste no catálogo.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
