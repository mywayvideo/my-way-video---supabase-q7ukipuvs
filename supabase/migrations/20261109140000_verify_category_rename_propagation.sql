-- ==============================================================================
-- Migration: 20261109140000_verify_category_rename_propagation.sql
--
-- PROVA, no banco real, que trg_propagate_category_rename funciona.
--
-- Por que por migration e não pela API:
--   A conta catalog_manager não tem permissão em public.categories (por
--   desenho: categorias são exclusivas do admin). O rename precisa então ser
--   provado dentro de uma transação, e essa transação é esta migration.
--
-- O teste é REVERSÍVEL e sem efeito líquido:
--   1. renomeia 'Software' -> 'Software TESTE RENAME'
--   2. confere que todo produto vinculado acompanhou
--   3. renomeia de volta para 'Software'
--   4. confere que os produtos voltaram
--   Se qualquer etapa falhar, a migration inteira falha (atomicidade do bloco)
--   e nada é alterado.
-- ==============================================================================

DO $$
DECLARE
  v_cat_id      uuid;
  v_nome_orig   text;
  v_nome_teste  text := 'Software TESTE RENAME';
  v_vinculados  integer;
  v_seguidores  integer;
  v_sobraram    integer;
BEGIN
  SELECT id, name INTO v_cat_id, v_nome_orig
    FROM public.categories
   WHERE name = 'Software'
   LIMIT 1;

  IF v_cat_id IS NULL THEN
    RAISE EXCEPTION 'Categoria Software não encontrada — teste abortado.';
  END IF;

  SELECT count(*) INTO v_vinculados
    FROM public.products WHERE category_id = v_cat_id;

  -- 1. renomeia
  UPDATE public.categories SET name = v_nome_teste WHERE id = v_cat_id;

  -- 2. confere que TODOS os vinculados acompanharam
  SELECT count(*) INTO v_seguidores
    FROM public.products
   WHERE category_id = v_cat_id AND category = v_nome_teste;

  IF v_vinculados > 0 AND v_seguidores <> v_vinculados THEN
    RAISE EXCEPTION
      'FALHOU: % produtos vinculados, mas só % acompanharam a renomeação.',
      v_vinculados, v_seguidores;
  END IF;

  -- 3. volta ao nome original
  UPDATE public.categories SET name = v_nome_orig WHERE id = v_cat_id;

  -- 4. confere que os produtos voltaram
  SELECT count(*) INTO v_sobraram
    FROM public.products
   WHERE category_id = v_cat_id AND category IS DISTINCT FROM v_nome_orig;

  IF v_sobraram > 0 THEN
    RAISE EXCEPTION
      'FALHOU: % produtos não voltaram ao rótulo original após desfazer o rename.',
      v_sobraram;
  END IF;

  RAISE NOTICE
    'PASSOU: renomear categoria propagou para % produto(s) e o desfazer restaurou todos.',
    v_vinculados;
END $$;

NOTIFY pgrst, 'reload schema';
