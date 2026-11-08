-- ==============================================================================
-- Migration: 20261108194500_catalog_manager_insert_defaults_and_cleanup.sql
--
-- Duas correções depois do teste de INSERT do perfil catalog_manager.
--
-- 1) DEFAULTS QUE FALTAVAM
--    O teste real de cadastro falhou na primeira tentativa com:
--      null value in column "is_special" of relation "products"
--      violates not-null constraint
--    Três colunas são NOT NULL e NÃO tinham default:
--      is_special, is_discontinued, price_nationalized_currency
--    O cliente (productService.createProduct) sempre envia as três, mas
--    depender disso é frágil: qualquer caminho que monte o payload sem elas
--    (importação, script, chamada direta) quebra com erro de banco obscuro.
--    Defaults aqui tornam o cadastro robusto sem mudar a regra de negócio.
--
-- 2) LIMPEZA DO PRODUTO DE TESTE
--    Durante o teste de permissão foi criado o produto ZZPROBE999 ("PROBE").
--    Ele NÃO deve ficar no catálogo. Removido por SKU exato — critério
--    verificável, sem UUID digitado à mão (lição do incidente de 07/11).
--    Salvaguarda: só remove se o SKU for exatamente 'ZZPROBE999'.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Defaults das colunas NOT NULL
-- ------------------------------------------------------------------------------
ALTER TABLE public.products
  ALTER COLUMN is_special      SET DEFAULT false,
  ALTER COLUMN is_discontinued SET DEFAULT false,
  ALTER COLUMN price_nationalized_currency SET DEFAULT 'BRL';

-- ------------------------------------------------------------------------------
-- 2. Remover o produto de teste, com verificação de contagem
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_antes  bigint;
  v_removidos bigint;
  v_depois bigint;
BEGIN
  SELECT count(*) INTO v_antes FROM public.products;

  DELETE FROM public.products WHERE sku = 'ZZPROBE999';
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  SELECT count(*) INTO v_depois FROM public.products;

  RAISE NOTICE 'Produtos: % -> % (removidos: %)', v_antes, v_depois, v_removidos;

  IF v_removidos > 1 THEN
    RAISE EXCEPTION 'Abortado: mais de um produto com o SKU de teste (%).', v_removidos;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
