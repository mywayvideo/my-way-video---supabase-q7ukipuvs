DO $$
BEGIN
  -- Fix company_info RLS policies
  DROP POLICY IF EXISTS "company_info_write_admin" ON public.company_info;
  CREATE POLICY "company_info_write_admin" ON public.company_info
    FOR ALL TO authenticated
    USING (public.check_is_admin())
    WITH CHECK (public.check_is_admin());

  -- Fix discount rule tables missing policies
  DROP POLICY IF EXISTS "discount_cats_all_admin" ON public.discount_rule_categories;
  CREATE POLICY "discount_cats_all_admin" ON public.discount_rule_categories
    FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());
    
  DROP POLICY IF EXISTS "discount_cats_read_public" ON public.discount_rule_categories;
  CREATE POLICY "discount_cats_read_public" ON public.discount_rule_categories FOR SELECT TO public USING (true);

  DROP POLICY IF EXISTS "discount_custs_all_admin" ON public.discount_rule_customers;
  CREATE POLICY "discount_custs_all_admin" ON public.discount_rule_customers
    FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());
    
  DROP POLICY IF EXISTS "discount_custs_read_public" ON public.discount_rule_customers;
  CREATE POLICY "discount_custs_read_public" ON public.discount_rule_customers FOR SELECT TO public USING (true);

  DROP POLICY IF EXISTS "discount_excl_all_admin" ON public.discount_rule_exclusions;
  CREATE POLICY "discount_excl_all_admin" ON public.discount_rule_exclusions
    FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());
    
  DROP POLICY IF EXISTS "discount_excl_read_public" ON public.discount_rule_exclusions;
  CREATE POLICY "discount_excl_read_public" ON public.discount_rule_exclusions FOR SELECT TO public USING (true);

  DROP POLICY IF EXISTS "discount_mfg_all_admin" ON public.discount_rule_manufacturers;
  CREATE POLICY "discount_mfg_all_admin" ON public.discount_rule_manufacturers
    FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());
    
  DROP POLICY IF EXISTS "discount_mfg_read_public" ON public.discount_rule_manufacturers;
  CREATE POLICY "discount_mfg_read_public" ON public.discount_rule_manufacturers FOR SELECT TO public USING (true);

  DROP POLICY IF EXISTS "discount_prods_all_admin" ON public.discount_rule_products;
  CREATE POLICY "discount_prods_all_admin" ON public.discount_rule_products
    FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());
    
  DROP POLICY IF EXISTS "discount_prods_read_public" ON public.discount_rule_products;
  CREATE POLICY "discount_prods_read_public" ON public.discount_rule_products FOR SELECT TO public USING (true);
END $$;
