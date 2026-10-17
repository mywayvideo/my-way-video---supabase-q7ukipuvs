-- Migration: create 'Production Switchers' category
-- Name: Production Switchers
-- Description: Switchers de produção ATEM e similares, incluindo painéis de controle
-- Acceptable NCMs: 8543.70.35 (switcher com 8+ entradas), 8543.70.99, 8537.10 (painéis de controle elétricos), 8517.62 (switchers IP/Ethernet)

INSERT INTO public.categories (name, description, is_active, acceptable_ncms)
VALUES (
  'Production Switchers',
  'Switchers de produção ATEM e similares, incluindo painéis de controle',
  true,
  '{"8543.70.35", "8543.70.99", "8537.10", "8517.62"}'::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Garantir idempotência caso a categoria já tenha sido criada com o mesmo nome
UPDATE public.categories
SET 
  description = 'Switchers de produção ATEM e similares, incluindo painéis de controle',
  is_active = true,
  acceptable_ncms = '{"8543.70.35", "8543.70.99", "8537.10", "8517.62"}'::text[]
WHERE name = 'Production Switchers';
