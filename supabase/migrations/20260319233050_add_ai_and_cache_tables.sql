DO $$
BEGIN
    -- 1. Create ai_providers table
    CREATE TABLE IF NOT EXISTS public.ai_providers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_name TEXT NOT NULL UNIQUE CHECK (provider_name IN ('openai', 'gemini', 'deepseek')),
        api_key_secret_name TEXT NOT NULL,
        model_id TEXT NOT NULL,
        is_active BOOLEAN DEFAULT false,
        priority_order INTEGER DEFAULT 999,
        last_validated_at TIMESTAMPTZ,
        validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'error')),
        validation_error TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- Indexes for ai_providers
    CREATE INDEX IF NOT EXISTS ai_providers_priority_active_idx ON public.ai_providers(priority_order, is_active);

    -- RLS for ai_providers (Admin only)
    ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Admin full access ai_providers" ON public.ai_providers;
    CREATE POLICY "Admin full access ai_providers" ON public.ai_providers
        FOR ALL TO authenticated 
        USING (
            (auth.jwt() ->> 'role') = 'admin' OR 
            (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR 
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        );

    -- Seed Data for ai_providers (Idempotent)
    INSERT INTO public.ai_providers (provider_name, api_key_secret_name, model_id, is_active, priority_order)
    VALUES
        ('openai', 'OPENAI_API_KEY', 'gpt-4o-mini', true, 1),
        ('gemini', 'GEMINI_API_KEY', 'gemini-2.0-flash', false, 999),
        ('deepseek', 'DEEPSEEK_API_KEY', 'deepseek-chat', false, 999)
    ON CONFLICT (provider_name) DO UPDATE
    SET 
        api_key_secret_name = EXCLUDED.api_key_secret_name,
        model_id = EXCLUDED.model_id;


    -- 2. Create product_search_cache table
    CREATE TABLE IF NOT EXISTS public.product_search_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        search_query TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_description TEXT,
        product_price NUMERIC(12,2),
        product_currency TEXT DEFAULT 'USD',
        product_image_url TEXT,
        product_specs JSONB,
        source TEXT NOT NULL CHECK (source IN ('ai_generated', 'manual_entry', 'web_search')),
        created_by_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- Indexes for product_search_cache
    CREATE INDEX IF NOT EXISTS product_search_cache_query_idx ON public.product_search_cache(search_query);
    CREATE INDEX IF NOT EXISTS product_search_cache_created_idx ON public.product_search_cache(created_at DESC);

    -- RLS for product_search_cache
    ALTER TABLE public.product_search_cache ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Auth read cache" ON public.product_search_cache;
    DROP POLICY IF EXISTS "Admin write cache" ON public.product_search_cache;

    CREATE POLICY "Auth read cache" ON public.product_search_cache
        FOR SELECT TO authenticated USING (true);
        
    CREATE POLICY "Admin write cache" ON public.product_search_cache
        FOR ALL TO authenticated 
        USING (
            (auth.jwt() ->> 'role') = 'admin' OR 
            (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR 
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        );

END $$;
