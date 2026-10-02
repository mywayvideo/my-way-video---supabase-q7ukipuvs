-- Migração: Sistema de datas de alteração e revisão de produtos (products)
-- Regras contratuais:
-- 1. Criação: created_at = updated_at = last_reviewed_at
-- 2. Alteração real (conteúdo mudou): updated_at = now() E last_reviewed_at = now() (mesmo valor)
-- 3. Conferência manual (somente last_reviewed_at informado sem mudança de conteúdo): preserva updated_at, atualiza last_reviewed_at
-- 4. Save sem mudança de conteúdo: preserva valores existentes (não altera datas)
-- 5. Invariante: last_reviewed_at >= updated_at sempre

-- 1. Adicionar colunas caso não existam
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;

-- 2. Backfill para linhas existentes: updated_at = created_at e last_reviewed_at = created_at
UPDATE public.products
SET
  updated_at = COALESCE(updated_at, created_at, NOW()),
  last_reviewed_at = COALESCE(last_reviewed_at, created_at, NOW())
WHERE updated_at IS NULL OR last_reviewed_at IS NULL;

-- 3. Definir constraints NOT NULL e DEFAULT now()
ALTER TABLE public.products
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN last_reviewed_at SET DEFAULT NOW(),
  ALTER COLUMN last_reviewed_at SET NOT NULL;

-- 4. Constraint de checagem da invariante: last_reviewed_at >= updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_products_review_gte_updated'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_review_gte_updated
      CHECK (last_reviewed_at >= updated_at);
  END IF;
END $$;

-- 5. Função de trigger para INSERT e UPDATE
CREATE OR REPLACE FUNCTION public.trg_products_audit_dates()
RETURNS trigger AS $$
DECLARE
  v_now timestamptz;
  v_content_changed boolean;
BEGIN
  -- INSERT: se updated_at ou last_reviewed_at não forem explicitamente fornecidos (ou se diferirem de created_at),
  -- garantir que as 3 datas nasçam iguais: created_at = updated_at = last_reviewed_at.
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := NOW();
    END IF;
    -- Se a aplicação não enviou valores específicos ou se enviou apenas created_at, igualar todos a created_at
    NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at);
    NEW.last_reviewed_at := COALESCE(NEW.last_reviewed_at, NEW.updated_at);

    -- Garantir invariante se inserido manualmente
    IF NEW.last_reviewed_at < NEW.updated_at THEN
      NEW.last_reviewed_at := NEW.updated_at;
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE:
  -- Comparar NEW com OLD ignorando: updated_at, last_reviewed_at e created_at
  v_content_changed := (
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.sku IS DISTINCT FROM OLD.sku OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.price_brl IS DISTINCT FROM OLD.price_brl OR
    NEW.stock IS DISTINCT FROM OLD.stock OR
    NEW.image_url IS DISTINCT FROM OLD.image_url OR
    NEW.ncm IS DISTINCT FROM OLD.ncm OR
    NEW.weight IS DISTINCT FROM OLD.weight OR
    NEW.dimensions IS DISTINCT FROM OLD.dimensions OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.is_special IS DISTINCT FROM OLD.is_special OR
    NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id OR
    NEW.price_usd IS DISTINCT FROM OLD.price_usd OR
    NEW.price_cost IS DISTINCT FROM OLD.price_cost OR
    NEW.technical_info IS DISTINCT FROM OLD.technical_info OR
    NEW.is_discontinued IS DISTINCT FROM OLD.is_discontinued OR
    NEW.category_id IS DISTINCT FROM OLD.category_id OR
    NEW.manual_related_ids IS DISTINCT FROM OLD.manual_related_ids OR
    NEW.ai_related_ids IS DISTINCT FROM OLD.ai_related_ids OR
    NEW.price_nationalized_sales IS DISTINCT FROM OLD.price_nationalized_sales OR
    NEW.price_nationalized_cost IS DISTINCT FROM OLD.price_nationalized_cost OR
    NEW.price_nationalized_currency IS DISTINCT FROM OLD.price_nationalized_currency OR
    NEW.rejected_related_ids IS DISTINCT FROM OLD.rejected_related_ids OR
    NEW.price_usa_rebate IS DISTINCT FROM OLD.price_usa_rebate OR
    NEW.price_cost_rebate IS DISTINCT FROM OLD.price_cost_rebate OR
    NEW.date_rebate IS DISTINCT FROM OLD.date_rebate OR
    NEW.website_url IS DISTINCT FROM OLD.website_url OR
    NEW.ncm_audit_id IS DISTINCT FROM OLD.ncm_audit_id
  );

  IF v_content_changed THEN
    -- Regra 2: Alteração real de conteúdo -> ambos updated_at e last_reviewed_at = agora, com O MESMO valor
    v_now := NOW();
    NEW.updated_at := v_now;
    NEW.last_reviewed_at := v_now;
  ELSE
    -- O conteúdo NÃO mudou:
    -- Pode ser:
    -- (a) Conferência manual: a aplicação enviou um novo last_reviewed_at (ex: now())
    -- (b) Save sem alteração: preserva valores antigos (não altera nada)
    -- Se NEW.last_reviewed_at foi explicitamente atualizado para além de OLD.last_reviewed_at, aceita
    -- Caso contrário, preserva OLD.last_reviewed_at e OLD.updated_at
    IF NEW.last_reviewed_at IS NOT DISTINCT FROM OLD.last_reviewed_at THEN
      NEW.last_reviewed_at := OLD.last_reviewed_at;
    END IF;

    -- Não permitir que updated_at mude se o conteúdo não mudou
    IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      -- Se a aplicação tentou mexer em updated_at sem mudar conteúdo, reverte para OLD.updated_at
      NEW.updated_at := OLD.updated_at;
    END IF;
  END IF;

  -- Regra 5: Invariante garantida: last_reviewed_at >= updated_at
  IF NEW.last_reviewed_at < NEW.updated_at THEN
    NEW.last_reviewed_at := NEW.updated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger BEFORE INSERT OR UPDATE em public.products
DROP TRIGGER IF EXISTS trg_products_audit_dates ON public.products;
CREATE TRIGGER trg_products_audit_dates
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_products_audit_dates();

-- 7. Índice para suportar ordenação eficiente por last_reviewed_at
CREATE INDEX IF NOT EXISTS idx_products_last_reviewed_at ON public.products (last_reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products (updated_at DESC);
