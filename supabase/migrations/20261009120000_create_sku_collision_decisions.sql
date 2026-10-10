-- Migration: create sku_collision_decisions table for SKU standardization workflow
-- Date: 2026-10-09
-- Purpose: Store administrative decisions on duplicate/colliding product records
-- without altering or mutating public.products in Round 1.

CREATE TABLE IF NOT EXISTS public.sku_collision_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_sku TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Sony',
  is_sony BOOLEAN NOT NULL DEFAULT true,
  preferred_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  secondary_product_ids UUID[] NOT NULL DEFAULT '{}',
  decision_type TEXT NOT NULL DEFAULT 'undecided' CHECK (
    decision_type IN ('keep_preferred', 'distinct_products', 'merge_pending', 'undecided')
  ),
  notes TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sku_collision_key UNIQUE (normalized_sku, brand)
);

CREATE INDEX IF NOT EXISTS idx_sku_collision_norm ON public.sku_collision_decisions (normalized_sku);
CREATE INDEX IF NOT EXISTS idx_sku_collision_brand ON public.sku_collision_decisions (brand);
CREATE INDEX IF NOT EXISTS idx_sku_collision_decision ON public.sku_collision_decisions (decision_type);

ALTER TABLE public.sku_collision_decisions ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated admins
DROP POLICY IF EXISTS "Admin read sku_collision_decisions" ON public.sku_collision_decisions;
CREATE POLICY "Admin read sku_collision_decisions" ON public.sku_collision_decisions
  FOR SELECT TO authenticated
  USING (public.check_is_admin());

-- Write policies for authenticated admins
DROP POLICY IF EXISTS "Admin insert sku_collision_decisions" ON public.sku_collision_decisions;
CREATE POLICY "Admin insert sku_collision_decisions" ON public.sku_collision_decisions
  FOR INSERT TO authenticated
  WITH CHECK (public.check_is_admin());

DROP POLICY IF EXISTS "Admin update sku_collision_decisions" ON public.sku_collision_decisions;
CREATE POLICY "Admin update sku_collision_decisions" ON public.sku_collision_decisions
  FOR UPDATE TO authenticated
  USING (public.check_is_admin())
  WITH CHECK (public.check_is_admin());

DROP POLICY IF EXISTS "Admin delete sku_collision_decisions" ON public.sku_collision_decisions;
CREATE POLICY "Admin delete sku_collision_decisions" ON public.sku_collision_decisions
  FOR DELETE TO authenticated
  USING (public.check_is_admin());
