-- Permitir SELECT em imp_sim_tax_rates para anon e authenticated (consulta pública de alíquotas NCM)
DROP POLICY IF EXISTS "anon_select_imp_sim_tax_rates" ON public.imp_sim_tax_rates;
CREATE POLICY "anon_select_imp_sim_tax_rates" ON public.imp_sim_tax_rates
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_select_imp_sim_tax_rates" ON public.imp_sim_tax_rates;
CREATE POLICY "authenticated_select_imp_sim_tax_rates" ON public.imp_sim_tax_rates
  FOR SELECT TO authenticated USING (true);
