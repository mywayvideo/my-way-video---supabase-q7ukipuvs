-- Fase 2 do plano de acessórios: infraestrutura de COMPATIBILIDADE.
-- "Compatível" = afirmação técnica (acessório ↔ produto com que funciona).
-- NÃO confundir com "relacionado" (related_product_rules / ai_related_ids / manual_related_ids).
-- Nesta etapa a tabela nasce VAZIA: vínculos são criados manualmente pelo admin.
-- Migração NÃO é aplicada automaticamente no remoto: executar no SQL Editor e
-- terminar com NOTIFY pgrst, 'reload schema'.

CREATE TABLE IF NOT EXISTS public.product_compatibilities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  origem            text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'ai')),
  status            text NOT NULL DEFAULT 'sugerido' CHECK (status IN ('sugerido', 'aprovado', 'rejeitado')),
  justificativa_ia  text NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_compatibilities_accessory_product_key UNIQUE (accessory_id, product_id),
  CONSTRAINT product_compatibilities_not_self CHECK (accessory_id <> product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_compatibilities_product_id
  ON public.product_compatibilities (product_id);
CREATE INDEX IF NOT EXISTS idx_product_compatibilities_status
  ON public.product_compatibilities (accessory_id, status);

ALTER TABLE public.product_compatibilities ENABLE ROW LEVEL SECURITY;

-- Leitura pública apenas dos vínculos aprovados (consumo do site e do consultor).
DROP POLICY IF EXISTS "product_compatibilities_public_read_approved" ON public.product_compatibilities;
CREATE POLICY "product_compatibilities_public_read_approved"
  ON public.product_compatibilities
  FOR SELECT
  USING (status = 'aprovado');

-- Admin lê e grava tudo (inclusive sugestões e rejeitados, quando existirem).
DROP POLICY IF EXISTS "product_compatibilities_admin_all" ON public.product_compatibilities;
CREATE POLICY "product_compatibilities_admin_all"
  ON public.product_compatibilities
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Consulta de compatíveis aprovados de um acessório.
-- Retorna somente status = 'aprovado'. Sem linhas => tabela vazia => conjunto vazio (não erro).
-- Uso previsto: Consultor IA (integração futura) em supabase/functions ou no fluxo de
-- busca; hoje não é chamada por nenhuma tela do site.
CREATE OR REPLACE FUNCTION public.get_compatible_products(p_accessory_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  sku text,
  category text,
  price_brl numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p.id, p.name, p.sku, p.category, p.price_brl
    FROM public.product_compatibilities pc
    JOIN public.products p ON p.id = pc.product_id
   WHERE pc.accessory_id = p_accessory_id
     AND pc.status = 'aprovado'
   ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_compatible_products(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
