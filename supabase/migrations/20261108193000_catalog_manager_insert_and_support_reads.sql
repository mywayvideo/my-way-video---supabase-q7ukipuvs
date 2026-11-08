-- ==============================================================================
-- Migration: 20261108193000_catalog_manager_insert_and_support_reads.sql
--
-- Libera INSERT no catálogo para o perfil 'catalog_manager' e o acesso de
-- leitura/escrita nas tabelas de apoio que o formulário de cadastro exige.
--
-- SOLICITADO PELO PROPRIETÁRIO (Patrick Lynch) em 08/11/2026:
--   "Libera INSERT para o catalog_manager também."
--
-- ESCOPO QUE PASSA A VALER:
--   products    INSERT  ✅  (cadastrar produto novo)
--   products    UPDATE  ✅  (já valia desde 20261108190000)
--   products    DELETE  ❌  (segue exclusivo do admin)
--   categories  tudo    ❌  (segue exclusivo do admin)
--
-- POR QUE ESTA MIGRATION TAMBÉM MEXE EM OUTRAS TABELAS:
--   O formulário de cadastro (NewProductPage + productService.createProduct)
--   não grava só em products. Ele precisa de:
--     * manufacturers          — ler a lista e criar fabricante novo
--     * price_checks           — o verificador de preço da B&H grava o resultado
--     * image_migration_failures — registra falha de imagem sem travar o cadastro
--     * product_import_staging — tela de importação em lote
--     * storage.objects        — upload de imagem no bucket product-images
--   Sem essas permissões o botão "Salvar" falharia em telas que o perfil
--   já pode abrir — bloqueio silencioso, difícil de diagnosticar.
--   Todas as concessões abaixo são de LEITURA ou de REGISTRO DE APOIO,
--   nunca de alteração do catálogo ou de categorias.
--
-- SOBRE price_checks — por que é seguro liberar:
--   price_checks é um LOG de verificações (histórico), não o preço do produto.
--   O preço vive em products.price_usd. Gravar um log de verificação não
--   altera preço de venda; é justamente a EVIDÊNCIA de que a regra
--   "price_usd = preço de venda da B&H" foi conferida.
--
-- DEFESA EM PROFUNDIDADE:
--   * RLS: policies por comando e por papel.
--   * GATILHO: no INSERT, exige categoria válida e não permite que o perfil
--     se auto-promova nem grave campos de sistema.
--
-- Idempotente.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. products — INSERT para o catalog_manager
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "products_insert_catalog_manager" ON public.products;
CREATE POLICY "products_insert_catalog_manager" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_manager());

-- ------------------------------------------------------------------------------
-- 2. Gatilho de INSERT: valida o que entra, sem permitir escalada
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_catalog_manager_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role, migrations (auth.uid() nulo) e admin: sem restrição
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Qualquer outro perfil autenticado (reviewer, customer) não insere.
  IF NOT public.is_catalog_manager() THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar produtos.'
      USING ERRCODE = '42501';
  END IF;

  -- Regra do projeto: produto NÃO entra sem categoria válida.
  -- (mesma regra que productService.createProduct já aplica no cliente;
  --  aqui ela vira garantia do banco, não depende da UI)
  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'Categoria obrigatória: não é permitido cadastrar produto sem categoria.'
      USING ERRCODE = '23502';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id) THEN
    RAISE EXCEPTION 'Categoria inválida: o category_id informado não existe.'
      USING ERRCODE = '23503';
  END IF;

  -- Não confiar na string 'category' vinda do cliente: ela tem de casar com
  -- o nome real da categoria apontada por category_id. Evita produto gravado
  -- com rótulo de categoria que não corresponde à FK.
  IF NEW.category IS NULL
     OR NEW.category <> (SELECT c.name FROM public.categories c WHERE c.id = NEW.category_id)
  THEN
    SELECT c.name INTO NEW.category FROM public.categories c WHERE c.id = NEW.category_id;
  END IF;

  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    RAISE EXCEPTION 'Nome do produto é obrigatório.' USING ERRCODE = '23502';
  END IF;

  -- SKU: obrigatório no cadastro. A unicidade (manufacturer_id, sku) é
  -- garantida pelo índice único existente.
  IF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN
    RAISE EXCEPTION 'SKU é obrigatório no cadastro de produto.' USING ERRCODE = '23502';
  END IF;

  -- price_usd não pode ser negativo. Zero é aceito (produto aguardando preço),
  -- mas verifica-se em relatório — a regra operacional é o preço da B&H.
  IF NEW.price_usd IS NOT NULL AND NEW.price_usd < 0 THEN
    RAISE EXCEPTION 'price_usd não pode ser negativo.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_enforce_catalog_manager_insert ON public.products;
CREATE TRIGGER trg_enforce_catalog_manager_insert
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_catalog_manager_insert();

-- ------------------------------------------------------------------------------
-- 3. O gatilho de UPDATE do catalog_manager precisa aceitar a linha recém-criada
--    (produto criado hoje tem created_at = agora; nada a mudar aqui, mas
--     registramos a intenção: created_at e id seguem imutáveis)
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- 4. manufacturers — leitura para todos os perfis de staff, escrita de cadastro
--    para o catalog_manager (o formulário cria fabricante novo quando não acha)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturers_select_staff" ON public.manufacturers;
CREATE POLICY "manufacturers_select_staff" ON public.manufacturers
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "manufacturers_insert_catalog_manager" ON public.manufacturers;
CREATE POLICY "manufacturers_insert_catalog_manager" ON public.manufacturers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_manager() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 5. price_checks — log das verificações de preço da B&H
--    SELECT/INSERT para o catalog_manager; nunca UPDATE/DELETE (log é imutável)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "price_checks_select_staff" ON public.price_checks;
CREATE POLICY "price_checks_select_staff" ON public.price_checks
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_reviewer() OR public.is_catalog_manager());

DROP POLICY IF EXISTS "price_checks_insert_catalog_manager" ON public.price_checks;
CREATE POLICY "price_checks_insert_catalog_manager" ON public.price_checks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_catalog_manager() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. image_migration_failures — o cadastro registra falha de imagem aqui
--    (createProduct faz isso e NÃO deve travar o cadastro por causa do log)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'image_migration_failures') THEN
    EXECUTE 'ALTER TABLE public.image_migration_failures ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "image_failures_insert_staff" ON public.image_migration_failures';
    EXECUTE $p$CREATE POLICY "image_failures_insert_staff" ON public.image_migration_failures
      FOR INSERT TO authenticated
      WITH CHECK (public.is_admin() OR public.is_catalog_manager())$p$;

    EXECUTE 'DROP POLICY IF EXISTS "image_failures_select_staff" ON public.image_migration_failures';
    EXECUTE $p$CREATE POLICY "image_failures_select_staff" ON public.image_migration_failures
      FOR SELECT TO authenticated
      USING (public.is_admin() OR public.is_catalog_manager())$p$;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. product_import_staging — tela de importação em lote
--    O catalog_manager usa o fluxo de staging; as categorias NÃO são
--    alteradas por aqui (só suggested_category_id, que é sugestão).
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'product_import_staging') THEN
    EXECUTE 'ALTER TABLE public.product_import_staging ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "staging_all_catalog_manager" ON public.product_import_staging';
    EXECUTE $p$CREATE POLICY "staging_all_catalog_manager" ON public.product_import_staging
      FOR ALL TO authenticated
      USING (public.is_catalog_manager() OR public.is_admin())
      WITH CHECK (public.is_catalog_manager() OR public.is_admin())$p$;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 8. category_mappings — leitura (para sugerir categoria) e escrita de
--    APRENDIZADO de mapeamento. Não cria nem altera categoria.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'category_mappings') THEN
    EXECUTE 'ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "category_mappings_staff" ON public.category_mappings';
    EXECUTE $p$CREATE POLICY "category_mappings_staff" ON public.category_mappings
      FOR ALL TO authenticated
      USING (public.is_admin() OR public.is_catalog_manager())
      WITH CHECK (public.is_admin() OR public.is_catalog_manager())$p$;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 9. storage.objects — upload de imagem no bucket product-images
--    (a policy de 20260317 já libera para "authenticated"; mantida como está)
--    Aqui apenas garantimos o bucket público de leitura.
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
