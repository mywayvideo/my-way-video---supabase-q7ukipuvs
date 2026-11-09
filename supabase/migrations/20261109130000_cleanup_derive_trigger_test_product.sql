-- ==============================================================================
-- Migration: 20261109130000_cleanup_derive_trigger_test_product.sql
--
-- Remove o produto de teste criado em 09/11/2026 para provar que o gatilho
-- trg_derive_product_category_from_fk normaliza o rótulo no INSERT.
--
--   SKU:  TESTE-DERIVE-001
--   id:   8e114e4b-b242-4061-8abf-0df6f2839d8e
--
-- O DELETE pela API com a conta catalog_manager devolveu 200 mas não apagou:
-- a policy "products_delete_admin" filtra as linhas invisíveis para o perfil,
-- e o PostgREST responde 200 com corpo vazio (nenhuma linha afetada).
-- Exclusão de produto é exclusiva do admin — por isso a limpeza vem por
-- migration, como já foi feito em 20261108200000 / 20261108203000 / 20261108205000.
--
-- Travas: apaga SOMENTE pelo id fixo acima E pelo SKU exato. Se o registro não
-- existir, não faz nada.
-- ==============================================================================

DO $$
DECLARE
  v_removidos integer;
BEGIN
  DELETE FROM public.products
   WHERE id = '8e114e4b-b242-4061-8abf-0df6f2839d8e'::uuid
     AND sku = 'TESTE-DERIVE-001';

  GET DIAGNOSTICS v_removidos = ROW_COUNT;
  RAISE NOTICE 'Cleanup TESTE-DERIVE-001: % linha(s) removida(s).', v_removidos;
END $$;

-- Confirmação: não deve sobrar nada com esse SKU
DO $$
DECLARE
  v_restantes integer;
BEGIN
  SELECT count(*) INTO v_restantes
    FROM public.products
   WHERE sku = 'TESTE-DERIVE-001';

  IF v_restantes > 0 THEN
    RAISE EXCEPTION 'Ainda restam % produto(s) de teste TESTE-DERIVE-001.', v_restantes;
  END IF;

  RAISE NOTICE 'Confirmado: nenhum produto de teste restante.';
END $$;

NOTIFY pgrst, 'reload schema';
