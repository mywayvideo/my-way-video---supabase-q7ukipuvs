-- Migration: create product_import_staging and category_mappings tables
-- Timestamp: 20261018183000
--
-- IMPORTANT: Migrações em supabase/migrations NÃO são aplicadas automaticamente no Supabase remoto.
-- Execute este script no SQL Editor do painel Supabase e finalize com:
--   NOTIFY pgrst, 'reload schema';

-- 1. Tabela para memorização de mapeamentos de categorias confirmados pelo usuário
CREATE TABLE IF NOT EXISTS public.category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_category TEXT NOT NULL,
  source_category_normalized TEXT NOT NULL,
  target_category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  target_category_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('csv', 'bh', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único pela chave normalizada da categoria de origem
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_mappings_source_norm 
  ON public.category_mappings(source_category_normalized);

CREATE INDEX IF NOT EXISTS idx_category_mappings_target_id 
  ON public.category_mappings(target_category_id);

-- RLS para category_mappings
ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_category_mappings" ON public.category_mappings;
CREATE POLICY "public_read_category_mappings" ON public.category_mappings
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "admin_all_category_mappings" ON public.category_mappings;
CREATE POLICY "admin_all_category_mappings" ON public.category_mappings
  FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());

-- 2. Tabela de staging de produtos importados com categoria pendente de confirmação
CREATE TABLE IF NOT EXISTS public.product_import_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  batch_source TEXT NOT NULL CHECK (batch_source IN ('csv', 'bh', 'manual')),
  sku TEXT,
  name TEXT NOT NULL,
  manufacturer_id UUID REFERENCES public.manufacturers(id) ON DELETE SET NULL,
  brand_name TEXT,
  price_usd NUMERIC DEFAULT 0,
  price_cost NUMERIC DEFAULT 0,
  price_brl NUMERIC DEFAULT 0,
  weight NUMERIC DEFAULT 0,
  dimensions TEXT,
  stock INTEGER DEFAULT 0,
  ncm TEXT,
  image_url TEXT,
  description TEXT,
  technical_info TEXT,
  website_url TEXT,
  is_special BOOLEAN DEFAULT false,
  is_discontinued BOOLEAN DEFAULT false,
  price_nationalized_sales NUMERIC,
  price_nationalized_cost NUMERIC,
  price_nationalized_currency TEXT DEFAULT 'BRL',
  price_usa_rebate NUMERIC,
  price_cost_rebate NUMERIC,
  date_rebate TIMESTAMPTZ,
  
  -- Campos de categorização
  original_category TEXT,
  suggested_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  suggested_category_name TEXT,
  suggestion_confidence TEXT DEFAULT 'baixa' CHECK (suggestion_confidence IN ('alta', 'media', 'baixa')),
  suggestion_reason TEXT,
  
  -- Status do item na staging
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'discarded')),
  discard_reason TEXT,
  confirmed_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  confirmed_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadados gerais
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta para staging
CREATE INDEX IF NOT EXISTS idx_import_staging_status ON public.product_import_staging(status);
CREATE INDEX IF NOT EXISTS idx_import_staging_batch_id ON public.product_import_staging(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_staging_batch_source ON public.product_import_staging(batch_source);
CREATE INDEX IF NOT EXISTS idx_import_staging_created_at ON public.product_import_staging(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_staging_sku ON public.product_import_staging(sku);

-- RLS para product_import_staging
ALTER TABLE public.product_import_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_product_import_staging" ON public.product_import_staging;
CREATE POLICY "admin_all_product_import_staging" ON public.product_import_staging
  FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "public_read_product_import_staging" ON public.product_import_staging;
CREATE POLICY "public_read_product_import_staging" ON public.product_import_staging
  FOR SELECT TO public USING (is_admin());

-- 3. Seed inicial de mapeamentos confirmados essenciais (reutilizáveis em novos lotes)
DO $$
DECLARE
  v_switchers UUID;
  v_cameras UUID;
  v_audio UUID;
BEGIN
  SELECT id INTO v_switchers FROM public.categories WHERE name = 'Production Switchers' LIMIT 1;
  SELECT id INTO v_cameras FROM public.categories WHERE name = 'Cameras' LIMIT 1;
  SELECT id INTO v_audio FROM public.categories WHERE name = 'Audio' LIMIT 1;

  IF v_switchers IS NOT NULL THEN
    INSERT INTO public.category_mappings (source_category, source_category_normalized, target_category_id, target_category_name, source_type)
    VALUES 
      ('Control Panels', 'control panels', v_switchers, 'Production Switchers', 'bh'),
      ('Production Switcher', 'production switcher', v_switchers, 'Production Switchers', 'bh'),
      ('Production Switchers', 'production switchers', v_switchers, 'Production Switchers', 'bh')
    ON CONFLICT (source_category_normalized) DO UPDATE 
      SET target_category_id = EXCLUDED.target_category_id,
          target_category_name = EXCLUDED.target_category_name;
  END IF;

  IF v_cameras IS NOT NULL THEN
    INSERT INTO public.category_mappings (source_category, source_category_normalized, target_category_id, target_category_name, source_type)
    VALUES 
      ('ENG & Pro Camcorders', 'eng & pro camcorders', v_cameras, 'Cameras', 'bh'),
      ('Camcorders', 'camcorders', v_cameras, 'Cameras', 'bh')
    ON CONFLICT (source_category_normalized) DO UPDATE 
      SET target_category_id = EXCLUDED.target_category_id,
          target_category_name = EXCLUDED.target_category_name;
  END IF;

  IF v_audio IS NOT NULL THEN
    INSERT INTO public.category_mappings (source_category, source_category_normalized, target_category_id, target_category_name, source_type)
    VALUES 
      ('Microfone', 'microfone', v_audio, 'Audio', 'csv'),
      ('Microphones', 'microphones', v_audio, 'Audio', 'csv')
    ON CONFLICT (source_category_normalized) DO UPDATE 
      SET target_category_id = EXCLUDED.target_category_id,
          target_category_name = EXCLUDED.target_category_name;
  END IF;
END $$;
