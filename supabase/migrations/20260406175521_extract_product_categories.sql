-- ==============================================================================
-- Migration: 20260406175521_extract_product_categories.sql
-- DESATIVADA em 2026-11-07 por decisão do proprietário (Patrick Lynch).
--
-- ------------------------------------------------------------------------------
-- POR QUE ESTA MIGRATION FOI NEUTRALIZADA
-- ------------------------------------------------------------------------------
-- A versão original continha um laço que percorria TODOS os valores distintos
-- de public.products.category e criava uma categoria para cada um:
--
--     FOR rec IN (SELECT DISTINCT category FROM public.products
--                 WHERE category IS NOT NULL AND TRIM(category) != '') LOOP
--       IF NOT EXISTS (...) THEN
--         INSERT INTO public.categories (name) VALUES (rec.category);
--       END IF;
--     END LOOP;
--
-- Em 07/11/2026 às 21:38:03 UTC (18:38 local) essa migration executou pela
-- primeira vez neste banco, durante uma reconstrução de ambiente. Resultado:
--   * 143 categorias não-canônicas criadas em um único instante, copiando
--     rótulos legados livres ("Lentes Prime", "Câmeras Mirrorles", "Router",
--     "Media > AXS Memory", ...);
--   * 275 produtos re-vinculados a essas categorias pelo UPDATE da etapa 4;
--   * a fila de triagem, que era de 328 produtos, zerou de uma vez.
--
-- Prova do caráter automatizado: as 143 categorias E os produtos afetados
-- compartilham o timestamp exato 2026-11-07T21:38:03.192106+00:00, ao
-- microssegundo — impossível em operação manual pelo painel.
--
-- O defeito de projeto é que esta migration não é idempotente nem segura:
-- ela transforma dado sujo (rótulo livre) em estrutura (categoria oficial).
-- Enquanto estivesse no repositório, qualquer rebuild repetiria o estrago.
--
-- ------------------------------------------------------------------------------
-- O QUE ESTA VERSÃO FAZ
-- ------------------------------------------------------------------------------
-- Preserva APENAS a parte estrutural, que é segura e idempotente:
--   1. garante que a tabela public.categories existe;
--   2. garante a coluna public.products.category_id;
--   3. garante a chave estrangeira produtos -> categorias.
--
-- Remove integralmente:
--   * a extração de rótulos para categorias (o laço destrutivo);
--   * o vínculo automático por nome (UPDATE ... WHERE p.category = c.name).
--
-- A categorização de produtos passa a ser feita EXCLUSIVAMENTE por revisão
-- humana/assistida, conforme docs/criterios-revisao.md.
-- ==============================================================================

-- 1. Garante a existência da tabela (idempotente, inofensivo)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Garante a coluna de vínculo (idempotente)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID;

-- 3. Garante a chave estrangeira (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.table_constraints
     WHERE constraint_name = 'products_category_id_fkey'
       AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.categories(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. ETAPA DESTRUTIVA REMOVIDA
-- A extração automática de rótulos e o vínculo por nome foram eliminados.
-- Se algum dia for necessário recriar categorias a partir de rótulos, isso
-- deve ser feito por migration específica, com revisão e aprovação prévias,
-- e nunca dentro de um build automático.
DO $$
BEGIN
  RAISE NOTICE 'Migration 20260406175521: extracao automatica de categorias desativada em 2026-11-07. Estrutura preservada.';
END $$;
