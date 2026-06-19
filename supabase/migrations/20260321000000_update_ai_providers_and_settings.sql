DO $$
BEGIN
    -- 1. Alter ai_providers table to add dynamic provider fields
    ALTER TABLE public.ai_providers DROP CONSTRAINT IF EXISTS ai_providers_provider_name_check;
    
    ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS provider_type TEXT;
    ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS custom_endpoint TEXT;
    ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 999;
    
    -- Map existing provider names to types
    UPDATE public.ai_providers SET provider_type = provider_name WHERE provider_type IS NULL;
    
    -- 2. Alter ai_agent_settings to add new trigger and cache configurations
    ALTER TABLE public.ai_agent_settings ADD COLUMN IF NOT EXISTS cache_expiration_days INTEGER DEFAULT 30;
    ALTER TABLE public.ai_agent_settings ADD COLUMN IF NOT EXISTS whatsapp_trigger_low_confidence BOOLEAN DEFAULT true;
    ALTER TABLE public.ai_agent_settings ADD COLUMN IF NOT EXISTS whatsapp_trigger_purchase_keywords BOOLEAN DEFAULT true;
    ALTER TABLE public.ai_agent_settings ADD COLUMN IF NOT EXISTS whatsapp_trigger_project_keywords BOOLEAN DEFAULT true;
    ALTER TABLE public.ai_agent_settings ADD COLUMN IF NOT EXISTS whatsapp_trigger_expensive_product BOOLEAN DEFAULT true;
    
    -- 3. Create product_cache table
    CREATE TABLE IF NOT EXISTS public.product_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_name TEXT,
        product_specs JSONB,
        source TEXT DEFAULT 'web_search',
        cached_at TIMESTAMPTZ DEFAULT now(),
        expires_at TIMESTAMPTZ,
        user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now()
    );
    
    CREATE INDEX IF NOT EXISTS idx_product_cache_name ON public.product_cache(product_name);
    CREATE INDEX IF NOT EXISTS idx_product_cache_expires ON public.product_cache(expires_at);
    
    -- 4. Set RLS for product_cache
    ALTER TABLE public.product_cache ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Auth read cache" ON public.product_cache;
    CREATE POLICY "Auth read cache" ON public.product_cache FOR SELECT TO authenticated USING (true);
    
    DROP POLICY IF EXISTS "Admin write cache" ON public.product_cache;
    CREATE POLICY "Admin write cache" ON public.product_cache FOR ALL TO authenticated USING (
        (auth.jwt() ->> 'role') = 'admin' OR 
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR 
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

END $$;
