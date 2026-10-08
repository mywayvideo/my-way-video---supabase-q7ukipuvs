-- Migration: create price_checks table for B&H real-time and batch price verifications
-- Date: 2026-10-08

CREATE TABLE IF NOT EXISTS public.price_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  price_db NUMERIC,
  price_bh NUMERIC,
  diff_usd NUMERIC,
  diff_pct NUMERIC,
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  url_used TEXT,
  url_discovered BOOLEAN NOT NULL DEFAULT false,
  message TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_price_checks_status CHECK (
    status IN ('ok', 'divergente', 'descontinuado', 'sem_url_confirmada', 'erro')
  ),
  CONSTRAINT chk_price_checks_source CHECK (
    source IN ('manual', 'batch')
  )
);

CREATE INDEX IF NOT EXISTS idx_price_checks_product_id ON public.price_checks (product_id);
CREATE INDEX IF NOT EXISTS idx_price_checks_checked_at ON public.price_checks (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_checks_status ON public.price_checks (status);

ALTER TABLE public.price_checks ENABLE ROW LEVEL SECURITY;

-- Admins can read all price checks
DROP POLICY IF EXISTS "Admin read price_checks" ON public.price_checks;
CREATE POLICY "Admin read price_checks" ON public.price_checks
  FOR SELECT TO authenticated
  USING (public.check_is_admin());

-- Admins can insert/update/delete price checks if needed from client (writes also allowed for service role by default)
DROP POLICY IF EXISTS "Admin insert price_checks" ON public.price_checks;
CREATE POLICY "Admin insert price_checks" ON public.price_checks
  FOR INSERT TO authenticated
  WITH CHECK (public.check_is_admin());

DROP POLICY IF EXISTS "Admin update price_checks" ON public.price_checks;
CREATE POLICY "Admin update price_checks" ON public.price_checks
  FOR UPDATE TO authenticated
  USING (public.check_is_admin())
  WITH CHECK (public.check_is_admin());

DROP POLICY IF EXISTS "Admin delete price_checks" ON public.price_checks;
CREATE POLICY "Admin delete price_checks" ON public.price_checks
  FOR DELETE TO authenticated
  USING (public.check_is_admin());
