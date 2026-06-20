-- Create helper functions for RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $func$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.customers
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_customer_id()
RETURNS uuid AS $func$
  SELECT id FROM public.customers WHERE user_id = auth.uid() LIMIT 1;
$func$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS on ALL tables
DO $func$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(t) || ' ENABLE ROW LEVEL SECURITY;';
  END LOOP;
END $func$;

-- Public Read Tables
DO $func$
DECLARE
  t text;
  tables text[] := ARRAY[
    'categories', 'products', 'manufacturers', 'company_info', 'settings', 
    'pricing_settings', 'exchange_rate', 'shipping_configs', 'nab_market', 
    'app_settings', 'discounts', 'discount_rules'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public Read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Public Read" ON public.%I FOR SELECT USING (true)', t);
    
    EXECUTE format('DROP POLICY IF EXISTS "Admin Full Access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admin Full Access" ON public.%I USING (public.is_admin())', t);
  END LOOP;
END $func$;

-- User-Owned Tables (user_id)
DO $func$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cart_items', 'chat_messages', 'conversation_history', 'favorites', 'user_sessions', 'customers'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "User Owned Access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "User Owned Access" ON public.%I USING (user_id = auth.uid())', t);
    
    EXECUTE format('DROP POLICY IF EXISTS "Admin Full Access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admin Full Access" ON public.%I USING (public.is_admin())', t);
  END LOOP;
END $func$;

-- User-Owned Tables (customer_id)
DO $func$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customer_addresses', 'customer_favorites', 'customer_payment_methods', 'shopping_carts', 'orders'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "User Owned Access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "User Owned Access" ON public.%I USING (customer_id = public.get_current_customer_id())', t);
    
    EXECUTE format('DROP POLICY IF EXISTS "Admin Full Access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admin Full Access" ON public.%I USING (public.is_admin())', t);
  END LOOP;
END $func$;

-- User-Owned Tables (order_id)
DROP POLICY IF EXISTS "User Owned Access" ON public.order_items;
CREATE POLICY "User Owned Access" ON public.order_items USING (
  order_id IN (SELECT id FROM public.orders WHERE customer_id = public.get_current_customer_id())
);
DROP POLICY IF EXISTS "Admin Full Access" ON public.order_items;
CREATE POLICY "Admin Full Access" ON public.order_items USING (public.is_admin());

DROP POLICY IF EXISTS "User Owned Access" ON public.order_status_history;
CREATE POLICY "User Owned Access" ON public.order_status_history FOR SELECT USING (
  order_id IN (SELECT id FROM public.orders WHERE customer_id = public.get_current_customer_id())
);
DROP POLICY IF EXISTS "Admin Full Access" ON public.order_status_history;
CREATE POLICY "Admin Full Access" ON public.order_status_history USING (public.is_admin());

-- Administrative and Default Tables
DO $func$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_agent_settings', 'ai_providers', 'ai_settings', 'sales_metrics', 'ai_rate_limits',
    'price_settings', 'cache_settings', 'product_cache', 'product_search_cache', 'rate_limits',
    'avpro_keywords', 'coupon_usage', 'discount_coupons', 'discount_rule_categories',
    'discount_rule_customers', 'discount_rule_exclusions', 'discount_rule_manufacturers',
    'discount_rule_products', 'market_intelligence', 'order_refunds', 'order_returns',
    'page_visits', 'payment_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin Full Access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admin Full Access" ON public.%I USING (public.is_admin())', t);
  END LOOP;
END $func$;

-- Seed User
DO $func$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'plynchusa@gmail.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'plynchusa@gmail.com',
      crypt('Skip@Pass123!', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Admin"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.customers (id, user_id, email, full_name, role)
    VALUES (gen_random_uuid(), new_user_id, 'plynchusa@gmail.com', 'Admin User', 'admin')
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    UPDATE public.customers 
    SET role = 'admin' 
    WHERE email = 'plynchusa@gmail.com';
  END IF;
END $func$;
