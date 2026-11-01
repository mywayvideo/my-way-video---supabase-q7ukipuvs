-- Migration: create scansource_import_audits table and extend product_import_staging batch_source check
-- Timestamp: 20261101160000
--
-- IMPORTANT: Migrações em supabase/migrations NÃO são aplicadas automaticamente no Supabase remoto.
-- O usuário deve executar este script no SQL Editor do painel Supabase e finalizar com:
--   NOTIFY pgrst, 'reload schema';

-- 1. Permitir batch_source = 'scansource' na tabela product_import_staging
ALTER TABLE public.product_import_staging DROP CONSTRAINT IF EXISTS product_import_staging_batch_source_check;
ALTER TABLE public.product_import_staging ADD CONSTRAINT product_import_staging_batch_source_check 
  CHECK (batch_source IN ('csv', 'bh', 'manual', 'scansource'));

-- 2. Tabela de auditoria para execuções da tabela de preços ScanSource
CREATE TABLE IF NOT EXISTS public.scansource_import_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  effective_date TEXT,
  total_sheet_rows INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  unchanged_count INTEGER DEFAULT 0,
  ignored_sw_count INTEGER DEFAULT 0,
  ignored_3rd_count INTEGER DEFAULT 0,
  staging_pending_count INTEGER DEFAULT 0,
  anomalies_count INTEGER DEFAULT 0,
  missing_catalog_count INTEGER DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta para auditorias
CREATE INDEX IF NOT EXISTS idx_scansource_audits_created_at ON public.scansource_import_audits(created_at DESC);

-- RLS para scansource_import_audits
ALTER TABLE public.scansource_import_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_scansource_import_audits" ON public.scansource_import_audits;
CREATE POLICY "admin_all_scansource_import_audits" ON public.scansource_import_audits
  FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "public_read_scansource_import_audits" ON public.scansource_import_audits;
CREATE POLICY "public_read_scansource_import_audits" ON public.scansource_import_audits
  FOR SELECT TO public USING (is_admin());
