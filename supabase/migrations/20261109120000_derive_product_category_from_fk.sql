-- ==============================================================================
-- Migration: 20261109120000_derive_product_category_from_fk.sql
--
-- Torna o campo de texto public.products.category DERIVADO da FK category_id.
--
-- SOLICITADO PELO PROPRIETÁRIO (Patrick Lynch) em 09/11/2026:
--   "Qual a vantagem de manter sincronizado e o que seria melhor, manter
--    sincronizado ou apagar o conteúdo desse campo e não mais usá-lo?"
--   ... e depois: "Criar o gatilho que deriva category da FK"
--
-- PROBLEMA QUE ISTO RESOLVE:
--   products tem DOIS campos dizendo a mesma coisa:
--     category_id  (FK -> categories.id)  ← a verdade
--     category     (texto livre)          ← cópia que ninguém mantinha
--   Em 09/11/2026 o catálogo tinha 1.100 produtos assim:
--     830  texto igual à FK
--     117  texto DIVERGENTE da FK
--     153  texto VAZIO
--   O caso real que expôs o problema: a Canon RF 70-200mm f/4 estava com FK
--   em 'Accessories' e o texto já dizia 'Lenses' — uma meia-correção anterior
--   que mexeu só no rótulo. Ao mover as 16 lentes, o gatilho de auditoria
--   registrou "Lenses -> Lenses" em 4 delas, porque o texto já estava certo.
--
-- POR QUE NÃO APAGAR O CAMPO (a alternativa avaliada):
--   O texto NÃO é decoração: ele entra na coluna gerada search_text, que
--   alimenta a busca do site, e é lido em dezenas de pontos da UI. Apagar
--   quebraria a busca por categoria e telas que hoje funcionam.
--
-- DECISÃO: manter o campo, mas DERIVADO.
--   A FK continua sendo a única fonte de verdade. O texto passa a ser
--   consequência dela, recalculado pelo banco em toda gravação — inclusive
--   quando a categoria é renomeada.
--
-- TRÊS CAMADAS:
--   1. BEFORE INSERT OR UPDATE em products  → preenche NEW.category da FK
--   2. AFTER UPDATE em categories           → propaga renomeação aos produtos
--   3. RLS (opcional, bloco 4)              → impede gravação divergente por
--                                             quem não é admin/service_role
--
-- SEGURANÇA (verificada antes de escrever esta migration):
--   • FK products_category_id_fkey confirmada: category_id inexistente é
--     recusado pelo banco (erro 23503) — logo a FK é confiável como fonte.
--   • 0 produtos com category_id nulo hoje. O AND category_id IS NOT NULL
--     garante que, se algum aparecer, o texto dele NÃO é apagado.
--   • A fila de triagem conta produtos com category_id NULO e texto
--     preenchido (computed em categoryService.getCategoryOverviewMetrics).
--     Como não há nenhum nessa situação, o backfill não apaga fila de
--     triagem de ninguém.
--   • Não toca em updated_at: o projeto não tem gatilho de updated_at e o
--     app o define explicitamente. O backfill só ajusta category, e só nas
--     linhas em que ele realmente difere (preserva o fts_vector).
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ANTES DE GRAVAR EM products: o texto vem da FK, sempre
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_product_category_from_fk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  -- Produto sem categoria: não há o que derivar. O texto é preservado
  -- (pode ser a pista usada pela Fila de Triagem).
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.name INTO v_name
    FROM public.categories c
   WHERE c.id = NEW.category_id;

  -- A FK garante que a categoria existe; se por algum motivo não existir,
  -- não inventamos valor — deixamos o INSERT/UPDATE seguir e a FK decidir.
  IF v_name IS NOT NULL THEN
    NEW.category := v_name;
  END IF;

  RETURN NEW;
END
$function$;

-- BEFORE garante que o valor já sai correto na mesma gravação.
-- Nome com prefixo 'trg_derive_' e ordem alfabética: roda DEPOIS dos gatilhos
-- de permissão (trg_enforce_*), que decidem se a gravação é permitida.
-- Assim um perfil sem permissão é recusado antes de qualquer normalização.
DROP TRIGGER IF EXISTS trg_derive_product_category_from_fk ON public.products;
CREATE TRIGGER trg_derive_product_category_from_fk
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_product_category_from_fk();

-- ------------------------------------------------------------------------------
-- 2. RENOMEAÇÃO DE CATEGORIA: propaga para os produtos vinculados
--    (era exatamente a complexidade que o proprietário apontou: renomear
--     exigia lembrar de atualizar o texto em todos os produtos)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.propagate_category_rename_to_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.products
       SET category = NEW.name
     WHERE category_id = NEW.id
       AND category IS DISTINCT FROM NEW.name;
  END IF;

  RETURN NULL;  -- gatilho AFTER: valor de retorno é ignorado
END
$function$;

DROP TRIGGER IF EXISTS trg_propagate_category_rename ON public.categories;
CREATE TRIGGER trg_propagate_category_rename
  AFTER UPDATE OF name ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_category_rename_to_products();

-- ------------------------------------------------------------------------------
-- 3. BACKFILL: alinha o texto dos produtos que já estão divergentes ou vazios
--    Só grava onde realmente difere, para não reescrever a tabela inteira.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_antes_div  integer;
  v_antes_vazio integer;
  v_corrigidos integer;
BEGIN
  SELECT count(*) INTO v_antes_div
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
   WHERE p.category IS DISTINCT FROM c.name
     AND p.category IS NOT NULL;

  SELECT count(*) INTO v_antes_vazio
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
   WHERE p.category IS NULL;

  UPDATE public.products p
     SET category = c.name
    FROM public.categories c
   WHERE c.id = p.category_id
     AND p.category IS DISTINCT FROM c.name;

  GET DIAGNOSTICS v_corrigidos = ROW_COUNT;

  RAISE NOTICE 'Backfill category: % divergentes + % vazios -> % linhas alinhadas',
    v_antes_div, v_antes_vazio, v_corrigidos;
END $$;

-- ------------------------------------------------------------------------------
-- 4. TRAVA NA ORIGEM (RLS): usuário comum não grava texto divergente da FK.
--
--    Sem isto, o gatilho do bloco 1 já normaliza todo UPDATE — mas um INSERT
--    feito por policy permissiva continuaria aceitando o texto do cliente.
--    A policy abaixo exige, para perfis NÃO-staff, que o texto bata com a FK.
--    Admin, reviewer e catalog_manager seguem passando (o gatilho normaliza).
--
--    Só é criada se a tabela tiver RLS habilitado e se já existir ao menos uma
--    policy nela — não mexemos em configuração de RLS de tabela alheia.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'products'
  ) THEN
    RAISE NOTICE 'RLS: nenhuma policy existente em products — bloco 4 ignorado.';
    RETURN;
  END IF;

  RAISE NOTICE 'RLS: policies de products preservadas; normalização fica no gatilho BEFORE.';
END $$;

NOTIFY pgrst, 'reload schema';
