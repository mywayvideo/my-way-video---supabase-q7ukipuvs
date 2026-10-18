-- Migration: related_product_rules table, missing categories, and initial seed
-- Created: 2026-10-18
--
-- IMPORTANT: Migrações em supabase/migrations NÃO são aplicadas automaticamente no Supabase remoto.
-- Execute este script no SQL Editor do painel Supabase e finalize com:
--   NOTIFY pgrst, 'reload schema';

-- 1. Categorias complementares da taxonomia B&H caso não existam
INSERT INTO public.categories (id, name, description, is_active, acceptable_ncms)
VALUES
  (gen_random_uuid(), 'Chargers', 'Carregadores de baterias para câmeras, iluminação e acessórios', true, ARRAY['8504.40'::text]),
  (gen_random_uuid(), 'Memory Cards', 'Cartões de memória CFexpress, SD, SxS, CFast e micro-SD', true, ARRAY['8523.51'::text]),
  (gen_random_uuid(), 'Card Readers', 'Leitores de cartões de memória USB-C, Thunderbolt e dedicados', true, ARRAY['8471.70'::text, '8504.40'::text])
ON CONFLICT DO NOTHING;

-- Garantir que não criamos duplicadas se o nome já existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Chargers') THEN
    INSERT INTO public.categories (name, description, is_active, acceptable_ncms)
    VALUES ('Chargers', 'Carregadores de baterias para câmeras, iluminação e acessórios', true, ARRAY['8504.40'::text]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Memory Cards') THEN
    INSERT INTO public.categories (name, description, is_active, acceptable_ncms)
    VALUES ('Memory Cards', 'Cartões de memória CFexpress, SD, SxS, CFast e micro-SD', true, ARRAY['8523.51'::text]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Card Readers') THEN
    INSERT INTO public.categories (name, description, is_active, acceptable_ncms)
    VALUES ('Card Readers', 'Leitores de cartões de memória USB-C, Thunderbolt e dedicados', true, ARRAY['8471.70'::text, '8504.40'::text]);
  END IF;
END $$;

-- 2. Coluna ai_related_meta na tabela products (se não existir)
-- Estrutura: JSONB mapeando related_id -> { "confidence": "alta"|"media"|"baixa", "reason": "...", "rule_id": "uuid"|null }
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_related_meta JSONB DEFAULT '{}'::jsonb;

-- 3. Tabela related_product_rules
CREATE TABLE IF NOT EXISTS public.related_product_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_origem UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  categoria_alvo UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  tipo_relacao TEXT NOT NULL CHECK (tipo_relacao IN ('essencial', 'complemento', 'licenca', 'suporte')),
  prioridade INT NOT NULL DEFAULT 10,
  max_sugestoes INT NOT NULL DEFAULT 3,
  filtros_compatibilidade JSONB NOT NULL DEFAULT '{}'::jsonb,
  bidirecional BOOLEAN NOT NULL DEFAULT false,
  ativa BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_related_rules_origem ON public.related_product_rules(categoria_origem);
CREATE INDEX IF NOT EXISTS idx_related_rules_alvo ON public.related_product_rules(categoria_alvo);
CREATE INDEX IF NOT EXISTS idx_related_rules_ativa ON public.related_product_rules(ativa);

-- RLS
ALTER TABLE public.related_product_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_related_product_rules" ON public.related_product_rules;
CREATE POLICY "public_read_related_product_rules" ON public.related_product_rules
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "admin_all_related_product_rules" ON public.related_product_rules;
CREATE POLICY "admin_all_related_product_rules" ON public.related_product_rules
  FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());

-- 4. Seed idempotente das regras aprovadas pelo usuário
DO $$
DECLARE
  v_cam UUID;
  v_bat UUID;
  v_len UUID;
  v_med UUID;
  v_sof UUID;
  v_tri UUID;
  v_chg UUID;
  v_crd UUID;
  v_rdr UUID;
BEGIN
  SELECT id INTO v_cam FROM public.categories WHERE name = 'Cameras' LIMIT 1;
  SELECT id INTO v_bat FROM public.categories WHERE name = 'Batteries' LIMIT 1;
  SELECT id INTO v_len FROM public.categories WHERE name = 'Lenses' LIMIT 1;
  SELECT id INTO v_med FROM public.categories WHERE name = 'Media' LIMIT 1;
  SELECT id INTO v_sof FROM public.categories WHERE name = 'Software' LIMIT 1;
  SELECT id INTO v_tri FROM public.categories WHERE name = 'Tripods & Rigs' LIMIT 1;
  SELECT id INTO v_chg FROM public.categories WHERE name = 'Chargers' LIMIT 1;
  SELECT id INTO v_crd FROM public.categories WHERE name = 'Memory Cards' LIMIT 1;
  SELECT id INTO v_rdr FROM public.categories WHERE name = 'Card Readers' LIMIT 1;

  -- 1) Cameras -> Batteries (essencial, match battery_system)
  IF v_cam IS NOT NULL AND v_bat IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.related_product_rules WHERE categoria_origem = v_cam AND categoria_alvo = v_bat) THEN
      INSERT INTO public.related_product_rules (
        categoria_origem, categoria_alvo, tipo_relacao, prioridade, max_sugestoes, filtros_compatibilidade, bidirecional, ativa, observacoes
      ) VALUES (
        v_cam, v_bat, 'essencial', 1, 3,
        '{"spec": "battery_system", "match": "equal"}'::jsonb,
        false, true, 'Baterias compatíveis com o sistema da câmera'
      );
    END IF;
  END IF;

  -- 2) Cameras -> Lenses (essencial, match lens_mount)
  IF v_cam IS NOT NULL AND v_len IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.related_product_rules WHERE categoria_origem = v_cam AND categoria_alvo = v_len) THEN
      INSERT INTO public.related_product_rules (
        categoria_origem, categoria_alvo, tipo_relacao, prioridade, max_sugestoes, filtros_compatibilidade, bidirecional, ativa, observacoes
      ) VALUES (
        v_cam, v_len, 'essencial', 2, 4,
        '{"spec": "lens_mount", "match": "equal"}'::jsonb,
        false, true, 'Lentes compatíveis com o bocal da câmera'
      );
    END IF;
  END IF;

  -- 3) Cameras -> Media (essencial, match card_type / media_slot)
  IF v_cam IS NOT NULL AND v_med IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.related_product_rules WHERE categoria_origem = v_cam AND categoria_alvo = v_med) THEN
      INSERT INTO public.related_product_rules (
        categoria_origem, categoria_alvo, tipo_relacao, prioridade, max_sugestoes, filtros_compatibilidade, bidirecional, ativa, observacoes
      ) VALUES (
        v_cam, v_med, 'essencial', 3, 3,
        '{"spec": "media_slot", "target_spec": "card_type", "match": "contains"}'::jsonb,
        false, true, 'Mídias e cartões de memória aceitos pelos slots da câmera'
      );
    END IF;
  END IF;

  -- 4) Cameras -> Software (licenca, somente licenças compatíveis)
  IF v_cam IS NOT NULL AND v_sof IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.related_product_rules WHERE categoria_origem = v_cam AND categoria_alvo = v_sof) THEN
      INSERT INTO public.related_product_rules (
        categoria_origem, categoria_alvo, tipo_relacao, prioridade, max_sugestoes, filtros_compatibilidade, bidirecional, ativa, observacoes
      ) VALUES (
        v_cam, v_sof, 'licenca', 4, 2,
        '{"spec": "software_family", "match": "contains"}'::jsonb,
        false, true, 'Somente licenças compatíveis com o produto'
      );
    END IF;
  END IF;

  -- 5) Cameras -> Tripods & Rigs (complemento)
  IF v_cam IS NOT NULL AND v_tri IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.related_product_rules WHERE categoria_origem = v_cam AND categoria_alvo = v_tri) THEN
      INSERT INTO public.related_product_rules (
        categoria_origem, categoria_alvo, tipo_relacao, prioridade, max_sugestoes, filtros_compatibilidade, bidirecional, ativa, observacoes
      ) VALUES (
        v_cam, v_tri, 'complemento', 5, 2,
        '{}'::jsonb,
        false, true, 'Tripés e suportes complementares'
      );
    END IF;
  END IF;

  -- 6) Batteries <-> Chargers (suporte, BIDIRECIONAL)
  IF v_bat IS NOT NULL AND v_chg IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.related_product_rules WHERE categoria_origem = v_bat AND categoria_alvo = v_chg) THEN
      INSERT INTO public.related_product_rules (
        categoria_origem, categoria_alvo, tipo_relacao, prioridade, max_sugestoes, filtros_compatibilidade, bidirecional, ativa, observacoes
      ) VALUES (
        v_bat, v_chg, 'suporte', 1, 3,
        '{"spec": "battery_system", "match": "equal"}'::jsonb,
        true, true, 'Carregadores compatíveis com a bateria e vice-versa'
      );
    END IF;
  END IF;

  -- 7) Memory Cards <-> Card Readers (suporte, BIDIRECIONAL)
  -- Se Memory Cards existir ou se usar categoria Media
  IF v_crd IS NOT NULL AND v_rdr IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.related_product_rules WHERE categoria_origem = v_crd AND categoria_alvo = v_rdr) THEN
      INSERT INTO public.related_product_rules (
        categoria_origem, categoria_alvo, tipo_relacao, prioridade, max_sugestoes, filtros_compatibilidade, bidirecional, ativa, observacoes
      ) VALUES (
        v_crd, v_rdr, 'suporte', 1, 3,
        '{"spec": "card_type", "match": "contains"}'::jsonb,
        true, true, 'Cartão de memória relacionado com o leitor do cartão e vice-versa'
      );
    END IF;
  END IF;

  -- 8) Media <-> Card Readers (suporte adicional se o produto estiver com categoria Media genérica)
  IF v_med IS NOT NULL AND v_rdr IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.related_product_rules WHERE categoria_origem = v_med AND categoria_alvo = v_rdr) THEN
      INSERT INTO public.related_product_rules (
        categoria_origem, categoria_alvo, tipo_relacao, prioridade, max_sugestoes, filtros_compatibilidade, bidirecional, ativa, observacoes
      ) VALUES (
        v_med, v_rdr, 'suporte', 2, 3,
        '{"spec": "card_type", "match": "contains"}'::jsonb,
        true, true, 'Mídias e cartões de memória relacionados com seus leitores'
      );
    END IF;
  END IF;
END $$;
