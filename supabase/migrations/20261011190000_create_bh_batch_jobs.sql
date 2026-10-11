-- Migration: create_bh_batch_jobs
-- Description: Tabela para persistir jobs de lote de verificação de preços B&H (até 100 itens),
-- checkpoints por produto processado, status de execução e estatísticas acumuladas.
-- Permite retomar o processamento do ponto exato ao recarregar a tela ou abrir em outro navegador.
-- NOTA: Executar manualmente no Supabase SQL Editor e rodar NOTIFY pgrst, 'reload schema'.

CREATE TABLE IF NOT EXISTS public.bh_batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'paused', 'completed', 'cancelled', 'error'
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  current_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_ids UUID[] NOT NULL DEFAULT '{}',
  processed_ids UUID[] NOT NULL DEFAULT '{}',
  stats JSONB NOT NULL DEFAULT '{
    "totalSelected": 0,
    "processedCount": 0,
    "okCount": 0,
    "divergenceCount": 0,
    "urlDiscoveredCount": 0,
    "doubtfulLinkCount": 0,
    "discontinuedCount": 0,
    "errorCount": 0,
    "rebateDetectedCount": 0
  }'::jsonb,
  results JSONB NOT NULL DEFAULT '{}'::jsonb, -- mapa productId -> { checkResult, batchStatus, errorMessage, website_url, price_usd }
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- cooldownSeconds, batchSize, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_bh_batch_jobs_status ON public.bh_batch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bh_batch_jobs_created_at ON public.bh_batch_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bh_batch_jobs_user_id ON public.bh_batch_jobs(user_id);

-- Habilitar RLS
ALTER TABLE public.bh_batch_jobs ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para administradores / usuários autenticados
DROP POLICY IF EXISTS "Admin Full Access bh_batch_jobs" ON public.bh_batch_jobs;
CREATE POLICY "Admin Full Access bh_batch_jobs" ON public.bh_batch_jobs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
