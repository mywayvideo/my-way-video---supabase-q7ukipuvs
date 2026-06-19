ALTER TABLE public.discount_rules 
ADD COLUMN IF NOT EXISTS scope_data JSONB,
ADD COLUMN IF NOT EXISTS application_type TEXT,
ADD COLUMN IF NOT EXISTS role TEXT,
ADD COLUMN IF NOT EXISTS customers UUID[],
ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

ALTER TABLE public.discount_rules DROP CONSTRAINT IF EXISTS discount_rules_rule_type_check;

DO $$
BEGIN
  -- Set up RLS policies for discount_rules
  DROP POLICY IF EXISTS "allow_admin_all_discount_rules" ON public.discount_rules;
  CREATE POLICY "allow_admin_all_discount_rules" ON public.discount_rules
    FOR ALL TO authenticated USING (
      EXISTS ( SELECT 1 FROM public.customers WHERE customers.user_id = auth.uid() AND customers.role = 'admin' )
    );
    
  DROP POLICY IF EXISTS "allow_public_read_discount_rules" ON public.discount_rules;
  CREATE POLICY "allow_public_read_discount_rules" ON public.discount_rules
    FOR SELECT TO public USING (is_active = true);
END $$;
