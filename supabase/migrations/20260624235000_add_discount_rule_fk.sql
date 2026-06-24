DO $$
BEGIN
  -- Clean up orphaned records to ensure the constraint can be applied
  DELETE FROM public.discount_rule_customers
  WHERE discount_rule_id IS NOT NULL 
    AND discount_rule_id NOT IN (SELECT id FROM public.discount_rules);

  -- Add FK for discount_rule_customers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'discount_rule_customers_discount_rule_id_fkey'
      AND table_name = 'discount_rule_customers'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.discount_rule_customers
      ADD CONSTRAINT discount_rule_customers_discount_rule_id_fkey
      FOREIGN KEY (discount_rule_id) REFERENCES public.discount_rules(id) ON DELETE CASCADE;
  END IF;
END $$;
