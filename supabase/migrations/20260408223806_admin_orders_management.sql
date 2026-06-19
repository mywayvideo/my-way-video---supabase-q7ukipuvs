-- Adiciona a coluna notes na tabela orders se ela nao existir
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- Cria a tabela order_refunds para salvar os registros de devolucoes
CREATE TABLE IF NOT EXISTS public.order_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  bank_holder_name TEXT NOT NULL,
  bank_account_number TEXT NOT NULL,
  bank_routing_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ativa o RLS na nova tabela
ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

-- Garante politicas idempotentes para a tabela
DROP POLICY IF EXISTS "Admins can manage order refunds" ON public.order_refunds;
CREATE POLICY "Admins can manage order refunds" ON public.order_refunds
  FOR ALL TO authenticated USING (check_is_admin());
