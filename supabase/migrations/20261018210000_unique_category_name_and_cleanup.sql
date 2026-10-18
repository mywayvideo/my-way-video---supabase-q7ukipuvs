-- ==============================================================================
-- Migration: 20261018210000_unique_category_name_and_cleanup.sql
-- Objetivo:
-- 1. Unificar e mesclar categorias duplicadas ("Card Readers", "Chargers", "Memory Cards", "Production Switchers")
--    garantindo que qualquer produto ou referência (category_mappings, related_product_rules,
--    product_import_staging, discounts) seja remapeado para o id que permanece.
-- 2. Deletar as categorias duplicadas remanescentes (vazias).
-- 3. Criar índice único funcional sobre lower(trim(name)) na tabela categories
--    para impedir permanentemente criação ou edição com mesmo nome (case/trim-insensitive).
-- ==============================================================================

DO $$
DECLARE
  v_prod_switchers_keep uuid := 'd2e94dd1-5822-4577-bcca-29adb2456f57'::uuid;
  v_prod_switchers_drop uuid := '92a845ee-f307-46a8-a70d-a694242535b8'::uuid;

  v_card_readers_keep uuid := '6ded12a4-c83c-45aa-b424-0974f9de4f91'::uuid;
  v_card_readers_drop uuid := '6184d118-d1bd-4a2f-8799-1016c6ed129f'::uuid;

  v_chargers_keep uuid := 'e46c12f6-21b5-4d3b-9ba1-a865eb9fc3ad'::uuid;
  v_chargers_drop uuid := '612ad4ea-721a-4d1e-9f9e-03e33a0a910f'::uuid;

  v_memory_cards_keep uuid := '3b9604f8-4eba-4fa7-b54d-89b36e815966'::uuid;
  v_memory_cards_drop uuid := '5f51a41a-6ab3-4a3e-8919-4496ae2f0df2'::uuid;
BEGIN
  -- 1. Remapear Production Switchers
  UPDATE public.products
  SET category_id = v_prod_switchers_keep
  WHERE category_id = v_prod_switchers_drop;

  UPDATE public.category_mappings
  SET target_category_id = v_prod_switchers_keep
  WHERE target_category_id = v_prod_switchers_drop;

  UPDATE public.product_import_staging
  SET suggested_category_id = v_prod_switchers_keep
  WHERE suggested_category_id = v_prod_switchers_drop;

  UPDATE public.product_import_staging
  SET confirmed_category_id = v_prod_switchers_keep
  WHERE confirmed_category_id = v_prod_switchers_drop;

  UPDATE public.related_product_rules
  SET categoria_origem = v_prod_switchers_keep
  WHERE categoria_origem = v_prod_switchers_drop;

  UPDATE public.related_product_rules
  SET categoria_alvo = v_prod_switchers_keep
  WHERE categoria_alvo = v_prod_switchers_drop;

  UPDATE public.discounts
  SET category_id = v_prod_switchers_keep
  WHERE category_id = v_prod_switchers_drop;

  -- 2. Remapear Card Readers
  UPDATE public.products
  SET category_id = v_card_readers_keep
  WHERE category_id = v_card_readers_drop;

  UPDATE public.category_mappings
  SET target_category_id = v_card_readers_keep
  WHERE target_category_id = v_card_readers_drop;

  UPDATE public.product_import_staging
  SET suggested_category_id = v_card_readers_keep
  WHERE suggested_category_id = v_card_readers_drop;

  UPDATE public.product_import_staging
  SET confirmed_category_id = v_card_readers_keep
  WHERE confirmed_category_id = v_card_readers_drop;

  UPDATE public.related_product_rules
  SET categoria_origem = v_card_readers_keep
  WHERE categoria_origem = v_card_readers_drop;

  UPDATE public.related_product_rules
  SET categoria_alvo = v_card_readers_keep
  WHERE categoria_alvo = v_card_readers_drop;

  UPDATE public.discounts
  SET category_id = v_card_readers_keep
  WHERE category_id = v_card_readers_drop;

  -- 3. Remapear Chargers
  UPDATE public.products
  SET category_id = v_chargers_keep
  WHERE category_id = v_chargers_drop;

  UPDATE public.category_mappings
  SET target_category_id = v_chargers_keep
  WHERE target_category_id = v_chargers_drop;

  UPDATE public.product_import_staging
  SET suggested_category_id = v_chargers_keep
  WHERE suggested_category_id = v_chargers_drop;

  UPDATE public.product_import_staging
  SET confirmed_category_id = v_chargers_keep
  WHERE confirmed_category_id = v_chargers_drop;

  UPDATE public.related_product_rules
  SET categoria_origem = v_chargers_keep
  WHERE categoria_origem = v_chargers_drop;

  UPDATE public.related_product_rules
  SET categoria_alvo = v_chargers_keep
  WHERE categoria_alvo = v_chargers_drop;

  UPDATE public.discounts
  SET category_id = v_chargers_keep
  WHERE category_id = v_chargers_drop;

  -- 4. Remapear Memory Cards
  UPDATE public.products
  SET category_id = v_memory_cards_keep
  WHERE category_id = v_memory_cards_drop;

  UPDATE public.category_mappings
  SET target_category_id = v_memory_cards_keep
  WHERE target_category_id = v_memory_cards_drop;

  UPDATE public.product_import_staging
  SET suggested_category_id = v_memory_cards_keep
  WHERE suggested_category_id = v_memory_cards_drop;

  UPDATE public.product_import_staging
  SET confirmed_category_id = v_memory_cards_keep
  WHERE confirmed_category_id = v_memory_cards_drop;

  UPDATE public.related_product_rules
  SET categoria_origem = v_memory_cards_keep
  WHERE categoria_origem = v_memory_cards_drop;

  UPDATE public.related_product_rules
  SET categoria_alvo = v_memory_cards_keep
  WHERE categoria_alvo = v_memory_cards_drop;

  UPDATE public.discounts
  SET category_id = v_memory_cards_keep
  WHERE category_id = v_memory_cards_drop;

  -- 5. Deletar os duplicados (idempotente)
  DELETE FROM public.categories
  WHERE id IN (
    v_prod_switchers_drop,
    v_card_readers_drop,
    v_chargers_drop,
    v_memory_cards_drop
  );
END $$;

-- 6. Criar índice único funcional sobre lower(trim(name))
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_normalized_name
ON public.categories (lower(trim(name)));

-- 7. Notificar PostgREST para recarregar o schema do banco
NOTIFY pgrst, 'reload schema';
