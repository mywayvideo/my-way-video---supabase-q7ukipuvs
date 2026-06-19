-- 1. Database - Enable Row Level Security (RLS)
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_carts ENABLE ROW LEVEL SECURITY;

-- 2. Secure RLS Policies: Replace auth.jwt() references with direct checks

-- ai_agent_settings
DROP POLICY IF EXISTS "Allow admin write on ai_agent_settings" ON public.ai_agent_settings;
CREATE POLICY "admin_all_ai_agent_settings" ON public.ai_agent_settings
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

-- ai_providers
DROP POLICY IF EXISTS "Admin full access ai_providers" ON public.ai_providers;
CREATE POLICY "admin_all_ai_providers" ON public.ai_providers
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

-- customers
DROP POLICY IF EXISTS "Enable DELETE for admins only" ON public.customers;
DROP POLICY IF EXISTS "Enable SELECT for admins - all data" ON public.customers;
DROP POLICY IF EXISTS "Enable UPDATE for admins - all data" ON public.customers;
DROP POLICY IF EXISTS "Enable SELECT for users own data only" ON public.customers;
DROP POLICY IF EXISTS "Enable UPDATE for users own data only" ON public.customers;

CREATE POLICY "admin_all_customers" ON public.customers
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

CREATE POLICY "user_read_own_customer" ON public.customers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "user_update_own_customer" ON public.customers
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- orders
DROP POLICY IF EXISTS "Customers can update own orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;

CREATE POLICY "user_update_own_orders" ON public.orders
  FOR UPDATE TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())) WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

CREATE POLICY "user_read_own_orders" ON public.orders
  FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- shopping_carts
DROP POLICY IF EXISTS "Customers can delete own cart" ON public.shopping_carts;
DROP POLICY IF EXISTS "Customers can update own cart" ON public.shopping_carts;
DROP POLICY IF EXISTS "Customers can view own cart" ON public.shopping_carts;

CREATE POLICY "user_update_own_cart" ON public.shopping_carts
  FOR UPDATE TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())) WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

CREATE POLICY "user_read_own_cart" ON public.shopping_carts
  FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

CREATE POLICY "user_delete_own_cart" ON public.shopping_carts
  FOR DELETE TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

-- discounts
DROP POLICY IF EXISTS "Admins can do everything" ON public.discounts;
CREATE POLICY "discounts_write_admin" ON public.discounts
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

-- product_cache
DROP POLICY IF EXISTS "Admin write cache" ON public.product_cache;
CREATE POLICY "product_cache_write_admin" ON public.product_cache
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

-- product_search_cache
DROP POLICY IF EXISTS "Admin write cache" ON public.product_search_cache;
CREATE POLICY "product_search_cache_write_admin" ON public.product_search_cache
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

-- 3. Public Read / Private Write

-- products
DROP POLICY IF EXISTS "products_select_public" ON public.products;
DROP POLICY IF EXISTS "Public Access" ON public.products;
DROP POLICY IF EXISTS "allow_public_read_products" ON public.products;
DROP POLICY IF EXISTS "allow_admin_update_products" ON public.products;

CREATE POLICY "products_select_public_new" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "products_write_admin" ON public.products
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

-- settings
DROP POLICY IF EXISTS "allow_all_read_settings" ON public.settings;
DROP POLICY IF EXISTS "allow_admin_write_settings" ON public.settings;

CREATE POLICY "settings_select_public_new" ON public.settings
  FOR SELECT USING (true);

CREATE POLICY "settings_write_admin" ON public.settings
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

-- exchange_rate
DROP POLICY IF EXISTS "exchange_rate_select_all" ON public.exchange_rate;
DROP POLICY IF EXISTS "exchange_rate_insert_admin" ON public.exchange_rate;
DROP POLICY IF EXISTS "exchange_rate_update_admin" ON public.exchange_rate;

CREATE POLICY "exchange_rate_select_public_new" ON public.exchange_rate
  FOR SELECT USING (true);

CREATE POLICY "exchange_rate_write_admin" ON public.exchange_rate
  FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());

-- 5. Edge Functions Security Path (Set search_path TO 'public' for SECURITY DEFINER database functions)

CREATE OR REPLACE FUNCTION public.check_is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.customers 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;
  
  RETURN v_is_admin;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_legacy_user(email_input text)
 RETURNS TABLE(id uuid, found boolean, full_name text, phone text, cpf text, billing_address jsonb, role character varying, is_imported boolean, has_migrated boolean, email text, user_id uuid, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    (c.is_imported = TRUE AND c.has_migrated = FALSE) as found,
    c.full_name,
    c.phone,
    c.cpf,
    c.billing_address,
    c.role,
    c.is_imported,
    c.has_migrated,
    c.email,
    c.user_id,
    c.status,
    c.created_at,
    c.updated_at
  FROM public.customers c
  WHERE c.email ILIKE trim(lower(email_input))
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_user_migration(cust_id uuid, new_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.users (id, email, role)
    SELECT id, email, 'customer'
    FROM auth.users 
    WHERE id = new_uid
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.customers
    SET 
        user_id = new_uid,
        is_imported = FALSE,
        has_migrated = TRUE,
        updated_at = NOW()
    WHERE id = cust_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customers WHERE email = NEW.email AND is_imported = true) THEN
    UPDATE public.customers
    SET user_id = NEW.id,
        full_name = COALESCE(full_name, NEW.raw_user_meta_data->>'name'),
        is_imported = false,
        has_migrated = true
    WHERE email = NEW.email AND is_imported = true;
  ELSE
    INSERT INTO public.customers (user_id, full_name, email)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_migration_started(target_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.customers
    SET 
        is_imported = FALSE,
        has_migrated = TRUE,
        updated_at = NOW()
    WHERE email = target_email;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_current_user_profile()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.customers
    SET 
        user_id = auth.uid(),
        has_migrated = TRUE,
        is_imported = FALSE,
        updated_at = NOW()
    WHERE LOWER(TRIM(email)) = LOWER(TRIM((SELECT email FROM auth.users WHERE id = auth.uid())))
    AND (user_id IS NULL OR user_id != auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.unified_search(search_term text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'stock', (
      SELECT COALESCE(json_agg(p), '[]'::json) FROM (
        SELECT * FROM products 
        WHERE ((name ILIKE '%' || search_term || '%') 
        OR (description ILIKE '%' || search_term || '%')
        OR (sku ILIKE '%' || search_term || '%'))
        AND is_discontinued = false
        LIMIT 20
      ) p
    ),
    'intel', (
      SELECT COALESCE(json_agg(c), '[]'::json) FROM (
        SELECT * FROM market_intelligence 
        WHERE ((raw_content ILIKE '%' || search_term || '%') 
        OR (title ILIKE '%' || search_term || '%')
        OR (ai_summary ILIKE '%' || search_term || '%'))
        AND status = 'published' 
        LIMIT 10
      ) c
    ),
    'nab_data', (
      SELECT COALESCE(json_agg(n), '[]'::json) FROM (
        SELECT * FROM nab_market 
        WHERE (title ILIKE '%' || search_term || '%' OR content ILIKE '%' || search_term || '%') 
        LIMIT 10
      ) n
    )
  );
$function$;
