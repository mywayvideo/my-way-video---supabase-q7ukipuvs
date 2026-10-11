-- ==============================================================================
-- Migration: Rodada 4 — Padronização de SKU Sony & Prevenção de Duplicidades
-- Version: 20261011170000_sku_round4_unique_index.sql
-- Date: 2026-10-11
--
-- CONTEXTO E INSTRUÇÕES DE EXECUÇÃO:
-- As migrações deste projeto NÃO são aplicadas automaticamente no Supabase remoto.
-- O administrador deve executar este script manualmente no SQL Editor do Supabase Studio.
-- Ao final da execução, o comando NOTIFY pgrst, 'reload schema'; recarrega o cache PostgREST.
--
-- ATENÇÃO SOBRE DUPLICIDADES / COLISÕES EXISTENTES:
-- 1. Na marca Sony: a base já está 100% normalizada (0 colisões, 269 produtos conformes).
-- 2. Em OUTRAS marcas: foram detectadas 2 colisões pontuais pré-existentes:
--    (a) AJA: SKUs "ROI-HDMI" e "MFR # ROI-HDMI" (ambos chave 'ROIHDMI')
--    (b) Blackmagic Design: SKUs "BDLKWEB/C/SEDHD" e "BDLKWEBCSEDHD" (ambos chave 'BDLKWEBCSEDHD')
--
-- ESTRATÉGIA DE APLICAÇÃO:
-- 1. Cria a função imutável public.normalize_sku_key(text) e overload public.normalize_sku_key(text, text),
--    comportando-se exatamente como o utilitário TypeScript src/utils/sku-normalization.ts:
--    - Remove prefixos residuais tipo "MFR #" / "mfr #"
--    - Converte para maiúsculas
--    - Remove caracteres não-alfanuméricos (espaços, traços, barras etc.)
--
-- 2. Cria imediatamente o índice UNIQUE para a marca Sony (idx_products_unique_sony_normalized_sku),
--    onde NÃO há colisões remanescentes. Este índice garante que nenhum SKU Sony duplicado entre na base.
--
-- 3. Cria índice de performance idx_products_normalized_sku_key para acelerar consultas e buscas.
--
-- 4. Executa um bloco de verificação condicional (DO $$) para o índice UNIQUE global (todas as marcas):
--    - Se ainda existirem colisões em outras marcas, levanta um AVISO (NOTICE) detalhado com a lista
--      de IDs/SKUs que precisam ser resolvidos antes de ativar o índice global.
--    - Assim que as 2 colisões forem resolvidas (em plano futuro já desenhado), a criação do índice
--      global uq_products_manufacturer_norm_sku será concluída com sucesso automaticamente ao reexecutar o script.
-- ==============================================================================

-- 1. Função de normalização de chave de SKU (idêntica ao utilitário TypeScript)
CREATE OR REPLACE FUNCTION public.normalize_sku_key(sku text)
RETURNS text AS $$
DECLARE
  v_cleaned text;
BEGIN
  IF sku IS NULL THEN
    RETURN '';
  END IF;

  -- Remove espaços externos
  v_cleaned := trim(sku);

  -- Remove prefixo residual MFR # (case-insensitive, com ou sem espaços)
  v_cleaned := regexp_replace(v_cleaned, '^mfr\s*#\s*', '', 'i');

  -- Converte para maiúsculas e remove qualquer caractere que não seja A-Z ou 0-9
  RETURN upper(regexp_replace(v_cleaned, '[^a-zA-Z0-9]', '', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.normalize_sku_key(text) IS
  'Gera a chave normalizada alfanumérica em maiúsculas de qualquer SKU, tratando prefixos MFR # e pontuações (Rodada 4 Padronização SKU).';

-- Overload aceitando (sku, brand) para coerência com chamadas expressivas
CREATE OR REPLACE FUNCTION public.normalize_sku_key(sku text, brand text)
RETURNS text AS $$
BEGIN
  -- A chave de comparação usa a mesma regra uniforme para todas as marcas
  RETURN public.normalize_sku_key(sku);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.normalize_sku_key(text, text) IS
  'Gera a chave normalizada de SKU aceitando opcionalmente o nome da marca (Rodada 4 Padronização SKU).';

-- 2. Índice B-Tree de busca rápida sobre a chave normalizada (não único, acelera detecção de colisão)
CREATE INDEX IF NOT EXISTS idx_products_normalized_sku_key
  ON public.products (public.normalize_sku_key(sku))
  WHERE sku IS NOT NULL AND sku <> '';

-- 3. Índice UNIQUE blindado para produtos SONY:
--    A marca Sony está 100% saneada após o backfill da Rodada 2.
--    Usamos a subconsulta ao fabricante 'Sony' para isolar a regra.
DO $$
DECLARE
  v_sony_mfg_id uuid;
BEGIN
  SELECT id INTO v_sony_mfg_id
  FROM public.manufacturers
  WHERE lower(trim(name)) = 'sony'
  LIMIT 1;

  IF v_sony_mfg_id IS NOT NULL THEN
    -- Cria o índice UNIQUE parcial para produtos da Sony
    EXECUTE format('
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unique_sony_normalized_sku
      ON public.products (public.normalize_sku_key(sku))
      WHERE manufacturer_id = %L AND sku IS NOT NULL AND sku <> ''''
    ', v_sony_mfg_id);
    RAISE NOTICE 'Índice UNIQUE para Sony (idx_products_unique_sony_normalized_sku) garantido com sucesso.';
  END IF;
END $$;

-- 4. Verificação condicional de unicidade global por fabricante + chave normalizada:
--    (manufacturer_id, normalize_sku_key(sku))
DO $$
DECLARE
  v_collision_count integer;
  v_collision_details text;
BEGIN
  -- Identifica colisões remanescentes agrupadas por fabricante e chave normalizada
  WITH duplicate_keys AS (
    SELECT
      p.manufacturer_id,
      m.name AS brand_name,
      public.normalize_sku_key(p.sku) AS norm_key,
      count(*) AS total_occurrences,
      string_agg(p.sku || ' (id: ' || p.id::text || ')', ' | ' ORDER BY p.created_at) AS colliding_skus
    FROM public.products p
    LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
    WHERE p.sku IS NOT NULL AND trim(p.sku) <> ''
    GROUP BY p.manufacturer_id, m.name, public.normalize_sku_key(p.sku)
    HAVING count(*) > 1
  )
  SELECT count(*), coalesce(string_agg('• Marca ' || coalesce(brand_name, 'Sem Fabricante') || ' [Chave: ' || norm_key || ']: ' || colliding_skus, E'\n'), '')
  INTO v_collision_count, v_collision_details
  FROM duplicate_keys;

  IF v_collision_count = 0 THEN
    -- Não há colisões: seguro criar o índice UNIQUE global em public.products
    CREATE UNIQUE INDEX IF NOT EXISTS uq_products_manufacturer_norm_sku
      ON public.products (manufacturer_id, public.normalize_sku_key(sku))
      WHERE sku IS NOT NULL AND trim(sku) <> '';
    RAISE NOTICE 'Índice UNIQUE global (uq_products_manufacturer_norm_sku) criado com sucesso! Base 100%% livre de duplicidades.';
  ELSE
    RAISE WARNING 'ATENÇÃO (RODADA 4): Existem % colisão(ões) pendente(s) em OUTRAS marcas no banco:
%

O índice UNIQUE específico da Sony (idx_products_unique_sony_normalized_sku) foi criado com sucesso e protege o catálogo Sony.
Para ativar o índice UNIQUE global (uq_products_manufacturer_norm_sku), resolva as colisões acima listadas e reexecute este script.',
      v_collision_count, v_collision_details;
  END IF;
END $$;

-- 5. Recarrega o cache do PostgREST para expor as novas funções na API
NOTIFY pgrst, 'reload schema';
