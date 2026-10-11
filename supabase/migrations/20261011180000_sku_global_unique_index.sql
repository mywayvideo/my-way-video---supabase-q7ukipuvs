-- ==============================================================================
-- Migration: Ativação do Índice UNIQUE Global Multi-Marca em public.products
-- Version: 20261011180000_sku_global_unique_index.sql
-- Date: 2026-10-11
--
-- CONTEXTO E INSTRUÇÕES DE EXECUÇÃO:
-- As migrações deste projeto NÃO são aplicadas automaticamente no Supabase remoto.
-- O administrador deve executar este script manualmente no SQL Editor do painel Supabase.
--
-- SEQUÊNCIA OBRIGATÓRIA:
-- 1. Acesse o painel em /admin/sku-standardization ("Central de Duplicidades").
-- 2. Na aba "Colisões Outras Marcas", resolva os 2 casos remanescentes:
--    (a) AJA: ROI-HDMI vs MFR # ROI-HDMI (duplicado de raspagem puro — confirme prevalência de ROI-HDMI).
--    (b) Blackmagic Design: BDLKWEB/C/SEDHD ($585) vs BDLKWEBCSEDHD ($569) (escolha o preço em vigor e prevalência).
-- 3. Após resolver os casos na interface (perdedores excluídos de vez e dados mesclados no prevalente),
--    execute este script no SQL Editor do Supabase Studio.
-- 4. O script valida se a base está com ZERO colisões remanescentes e cria o índice UNIQUE global:
--    uq_products_manufacturer_norm_sku ON public.products (manufacturer_id, public.normalize_sku_key(sku))
-- 5. Finaliza recarregando o cache do PostgREST via NOTIFY pgrst, 'reload schema';
-- ==============================================================================

-- 1. Garante que as funções de normalização existam de forma idempotente
CREATE OR REPLACE FUNCTION public.normalize_sku_key(sku text)
RETURNS text AS $$
DECLARE
  v_cleaned text;
BEGIN
  IF sku IS NULL THEN
    RETURN '';
  END IF;

  v_cleaned := trim(sku);
  v_cleaned := regexp_replace(v_cleaned, '^mfr\s*#\s*', '', 'i');
  RETURN upper(regexp_replace(v_cleaned, '[^a-zA-Z0-9]', '', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.normalize_sku_key(sku text, brand text)
RETURNS text AS $$
BEGIN
  RETURN public.normalize_sku_key(sku);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Garante o índice de busca rápida sobre a chave normalizada
CREATE INDEX IF NOT EXISTS idx_products_normalized_sku_key
  ON public.products (public.normalize_sku_key(sku))
  WHERE sku IS NOT NULL AND sku <> '';

-- 3. Bloco de validação e criação do índice UNIQUE global
DO $$
DECLARE
  v_collision_count integer;
  v_collision_details text;
BEGIN
  -- Identifica se ainda restam colisões agrupadas por fabricante e chave normalizada
  WITH duplicate_keys AS (
    SELECT
      p.manufacturer_id,
      m.name AS brand_name,
      public.normalize_sku_key(p.sku) AS norm_key,
      count(*) AS total_occurrences,
      string_agg(p.sku || ' (id: ' || p.id::text || ', US$ ' || coalesce(p.price_usd::text, 's/preço') || ')', ' | ' ORDER BY p.created_at) AS colliding_skus
    FROM public.products p
    LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
    WHERE p.sku IS NOT NULL AND trim(p.sku) <> ''
    GROUP BY p.manufacturer_id, m.name, public.normalize_sku_key(p.sku)
    HAVING count(*) > 1
  )
  SELECT count(*), coalesce(string_agg('• ' || coalesce(brand_name, 'Sem Fabricante') || ' [Chave: ' || norm_key || ']: ' || colliding_skus, E'\n'), '')
  INTO v_collision_count, v_collision_details
  FROM duplicate_keys;

  IF v_collision_count = 0 THEN
    -- Zero colisões no catálogo inteiro! Seguro criar o índice UNIQUE global
    CREATE UNIQUE INDEX IF NOT EXISTS uq_products_manufacturer_norm_sku
      ON public.products (manufacturer_id, public.normalize_sku_key(sku))
      WHERE sku IS NOT NULL AND trim(sku) <> '';

    RAISE NOTICE 'SUCESSO TOTAL: Índice UNIQUE global uq_products_manufacturer_norm_sku criado com sucesso!';
    RAISE NOTICE 'A base de produtos está 100%% blindada contra duplicidades de SKU em TODAS as marcas.';
  ELSE
    RAISE WARNING 'ATENÇÃO: Ainda restam % colisão(ões) pendente(s) no catálogo:
%

Para ativar o índice UNIQUE global, acesse a Central de Duplicidades (/admin/sku-standardization) na interface administrativa, resolva as pendências acima e reexecute este script.',
      v_collision_count, v_collision_details;
  END IF;
END $$;

-- 4. Recarrega o cache do PostgREST
NOTIFY pgrst, 'reload schema';
