-- ==============================================================================
-- Migration: 20261107234500_purge_58_incident_categories.sql
--
-- Remove as 58 categorias criadas indevidamente em 07/11/2026 21:38:03.192106 UTC
-- pela migration 20260406175521 (ja neutralizada na versao 0.0.755).
--
-- Autorizado pelo proprietario (Patrick Lynch) em 07/11/2026:
--   "apague as 58 categorias criadas indevidamente e agora desprovidas de
--    produtos associados"
--
-- CRITERIO DE IDENTIFICACAO: created_at EXATO '2026-11-07T21:38:03.192106+00:00'.
-- Esse instante e a assinatura da migration defeituosa: ela inseriu as 58
-- categorias E atualizou os produtos afetados no MESMO microssegundo
-- (verificado: exatamente 58 categorias possuem esse timestamp).
-- Usar o timestamp em vez de 58 UUIDs digitados a mao elimina o risco de erro
-- de transcricao e torna a migration auto-documentada.
--
-- TRES TRAVAS QUE ABORTAM A MIGRATION:
--   1. Se alguma categoria desse instante tiver produto vinculado.
--   2. Se alguma tiver nome igual a uma categoria canonica.
--   3. Se o total encontrado nesse instante NAO for exatamente 58.
--
-- Backup previo: work/mwv/backup_categories_antes.json (162 linhas) e
--                work/mwv/del58_ok.json (as 58 exatas, conferidas por script).
-- ==============================================================================

DO $$
DECLARE
  v_assinatura constant timestamptz := '2026-11-07T21:38:03.192106+00:00';
  v_esperado   constant int := 58;
  v_canonicas  text[] := ARRAY[
    'Accessories', 'Audio', 'Batteries & Chargers', 'Cables & Connectors',
    'Cameras', 'Card Readers', 'Control Panels', 'Converters', 'Desktop Video',
    'Lenses', 'Lighting', 'Memory Cards & Media', 'Monitors',
    'Networking & Storage', 'Production Switchers', 'Recorders', 'Software',
    'Streaming', 'Teleprompters', 'Tripods & Rigs'
  ];
  v_alvo       uuid[];
  v_n          int;
  v_ocupadas   text;
  v_colisao    text;
BEGIN
  -- Seleciona as categorias pela assinatura temporal
  SELECT array_agg(id) INTO v_alvo
    FROM public.categories
   WHERE created_at = v_assinatura;

  IF v_alvo IS NULL THEN
    RAISE NOTICE 'Nada a fazer: nenhuma categoria com a assinatura informada.';
    RETURN;
  END IF;

  -- TRAVA 3: o conjunto tem exatamente 58?
  IF array_length(v_alvo, 1) <> v_esperado THEN
    RAISE EXCEPTION 'ABORTADO: esperava % categorias na assinatura, encontrei %.',
      v_esperado, array_length(v_alvo, 1);
  END IF;

  -- TRAVA 1: alguma tem produto?
  SELECT string_agg(s.name || ' (' || s.cnt || ')', ', ')
    INTO v_ocupadas
  FROM (
    SELECT cat.name, count(p.id) AS cnt
      FROM public.categories cat
      LEFT JOIN public.products p ON p.category_id = cat.id
     WHERE cat.id = ANY(v_alvo)
     GROUP BY cat.name
    HAVING count(p.id) > 0
  ) s;

  IF v_ocupadas IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: categorias ainda com produtos: %', v_ocupadas;
  END IF;

  -- TRAVA 2: nome canonico?
  SELECT string_agg(cat.name, ', ')
    INTO v_colisao
  FROM public.categories cat
  WHERE cat.id = ANY(v_alvo)
    AND cat.name = ANY(v_canonicas);

  IF v_colisao IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: nome de categoria canonica na lista: %', v_colisao;
  END IF;

  -- EXCLUSAO
  DELETE FROM public.categories WHERE id = ANY(v_alvo);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Excluidas % categorias.', v_n;

  -- CONFERENCIA
  SELECT count(*) INTO v_n FROM public.categories;
  RAISE NOTICE 'Total de categorias restantes: %', v_n;
  SELECT count(*) INTO v_n FROM public.products WHERE category_id IS NULL;
  RAISE NOTICE 'Produtos sem categoria (deve permanecer 11): %', v_n;
  SELECT count(*) INTO v_n FROM public.products;
  RAISE NOTICE 'Total de produtos (deve permanecer 1099): %', v_n;
END $$;

NOTIFY pgrst, 'reload schema';
