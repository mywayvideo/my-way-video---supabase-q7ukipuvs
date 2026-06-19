DO $func$
DECLARE
  new_user_id uuid;
BEGIN
  -- Seed initial admin user if it does not exist
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
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Admin"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    -- Also insert into public.profiles if the table exists
    BEGIN
      INSERT INTO public.profiles (id, email, name, role)
      VALUES (new_user_id, 'plynchusa@gmail.com', 'Admin', 'admin')
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN undefined_table THEN
      -- Profiles table might not exist in this project's specific schema yet
    END;
  END IF;
END $func$;

-- Create market intelligence table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.market_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  ai_summary TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and setup policies idempotently
ALTER TABLE public.market_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_mi" ON public.market_intelligence;
CREATE POLICY "authenticated_select_mi" ON public.market_intelligence
  FOR SELECT TO authenticated USING (true);
  
DROP POLICY IF EXISTS "authenticated_insert_mi" ON public.market_intelligence;
CREATE POLICY "authenticated_insert_mi" ON public.market_intelligence
  FOR INSERT TO authenticated WITH CHECK (true);
  
DROP POLICY IF EXISTS "authenticated_update_mi" ON public.market_intelligence;
CREATE POLICY "authenticated_update_mi" ON public.market_intelligence
  FOR UPDATE TO authenticated USING (true);
  
DROP POLICY IF EXISTS "authenticated_delete_mi" ON public.market_intelligence;
CREATE POLICY "authenticated_delete_mi" ON public.market_intelligence
  FOR DELETE TO authenticated USING (true);

-- Create the robust RPC to fetch across products, PC, PSC, and Market Intelligence
CREATE OR REPLACE FUNCTION search_catalog_with_mi(search_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  stock_res json;
  pc_res json;
  psc_res json;
  mi_res json;
BEGIN
  -- We use dynamic execution wrapped in exception blocks 
  -- so it doesn't crash if any specific cache table doesn't exist yet
  
  -- 1. Search Stock (products)
  BEGIN
    EXECUTE 'SELECT COALESCE(json_agg(p), ''[]''::json) FROM (
      SELECT pr.id, pr.name, pr.description, pr.price
      FROM public.products pr
      WHERE pr.name ILIKE $1 OR pr.description ILIKE $1
      LIMIT 20
    ) p' INTO stock_res USING '%' || search_query || '%';
  EXCEPTION WHEN undefined_table THEN
    stock_res := '[]'::json;
  END;

  -- 2. Search Product Cache (PC)
  BEGIN
    EXECUTE 'SELECT COALESCE(json_agg(pc), ''[]''::json) FROM (
      SELECT id, title as name, description, price
      FROM public.product_cache
      WHERE title ILIKE $1 OR description ILIKE $1
      LIMIT 20
    ) pc' INTO pc_res USING '%' || search_query || '%';
  EXCEPTION WHEN undefined_table THEN
    BEGIN
      EXECUTE 'SELECT COALESCE(json_agg(pc), ''[]''::json) FROM (
        SELECT id, name, description, price
        FROM public.product_cache
        WHERE name ILIKE $1 OR description ILIKE $1
        LIMIT 20
      ) pc' INTO pc_res USING '%' || search_query || '%';
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      pc_res := '[]'::json;
    END;
  END;

  -- 3. Search Product Search Cache (PSC)
  BEGIN
    EXECUTE 'SELECT COALESCE(json_agg(psc), ''[]''::json) FROM (
      SELECT id, search_term
      FROM public.product_search_cache
      WHERE search_term ILIKE $1
      LIMIT 20
    ) psc' INTO psc_res USING '%' || search_query || '%';
  EXCEPTION WHEN undefined_table THEN
    psc_res := '[]'::json;
  END;

  -- 4. Search Market Intelligence (MI)
  BEGIN
    EXECUTE 'SELECT COALESCE(json_agg(mi), ''[]''::json) FROM (
      SELECT id, title, ai_summary
      FROM public.market_intelligence
      WHERE status = ''published''
        AND (title ILIKE $1 OR ai_summary ILIKE $1)
      LIMIT 20
    ) mi' INTO mi_res USING '%' || search_query || '%';
  EXCEPTION WHEN undefined_table THEN
    mi_res := '[]'::json;
  END;

  RETURN json_build_object(
    'stock', stock_res,
    'pc', pc_res,
    'psc', psc_res,
    'mi', mi_res
  );
END;
$func$;
