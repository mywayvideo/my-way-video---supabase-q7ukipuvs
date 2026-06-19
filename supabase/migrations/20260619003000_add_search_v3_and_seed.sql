-- 1. Ensure unaccent extension is available
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Create the AI Search V3 function
CREATE OR REPLACE FUNCTION public.execute_ai_search_v3(search_term text)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  v_query text;
BEGIN
  -- Clean and prepare search query using unaccent
  v_query := trim(public.unaccent(search_term));
  
  -- Create JSON response with 'stock' matching the expected interface
  SELECT jsonb_build_object(
    'stock', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'sku', p.sku,
          'category', p.category,
          'price_usd', p.price_usd,
          'price_brl', p.price_brl,
          'stock', p.stock,
          'image_url', p.image_url,
          'manufacturer_id', p.manufacturer_id,
          'description', p.description,
          'technical_info', p.technical_info
        )
      )
      FROM (
        SELECT id, name, sku, category, price_usd, price_brl, stock, image_url, manufacturer_id, description, technical_info, search_vector
        FROM public.products
        WHERE search_vector @@ websearch_to_tsquery('simple', v_query)
           OR public.unaccent(name) ILIKE '%' || v_query || '%'
           OR public.unaccent(COALESCE(sku, '')) ILIKE '%' || v_query || '%'
        ORDER BY 
          ts_rank(search_vector, websearch_to_tsquery('simple', v_query)) DESC,
          name ASC
        LIMIT 50
      ) p
    ), '[]'::jsonb),
    'pc', '[]'::jsonb,
    'psc', '[]'::jsonb,
    'mi', '[]'::jsonb
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RLS Compliance for products
DROP POLICY IF EXISTS "allow_authenticated_read_products" ON public.products;
CREATE POLICY "allow_authenticated_read_products" ON public.products
  FOR SELECT TO authenticated USING (true);
  
DROP POLICY IF EXISTS "allow_anon_read_products" ON public.products;
CREATE POLICY "allow_anon_read_products" ON public.products
  FOR SELECT TO anon USING (true);

-- 4. Auth Seed for plynchusa@gmail.com
DO $$
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
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "PM"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );
  END IF;
END $$;
