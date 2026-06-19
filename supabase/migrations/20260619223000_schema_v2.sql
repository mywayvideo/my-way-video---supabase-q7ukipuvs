-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Group 1: Independent Tables
CREATE TABLE IF NOT EXISTS public.manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.company_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'ai_knowledge',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pricing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spread_type TEXT NOT NULL DEFAULT 'percentage',
    spread_value NUMERIC NOT NULL DEFAULT 0,
    exchange_rate NUMERIC,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name TEXT NOT NULL,
    api_key_secret_name TEXT,
    model_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    priority_order INTEGER,
    last_validated_at TIMESTAMPTZ,
    validation_status TEXT CHECK (validation_status IN ('pending', 'valid', 'invalid', 'error')),
    validation_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider_type TEXT,
    custom_endpoint TEXT,
    priority INTEGER
);

CREATE TABLE IF NOT EXISTS public.product_search_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_query TEXT NOT NULL,
    product_name TEXT,
    product_description TEXT,
    product_price NUMERIC,
    product_currency TEXT,
    product_image_url TEXT,
    product_specs JSONB,
    source TEXT CHECK (source IN ('ai_generated', 'manual_entry', 'web_search')),
    created_by_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ai_agent_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_trigger_keywords TEXT[],
    max_web_search_attempts INTEGER DEFAULT 3,
    confidence_threshold_for_whatsapp NUMERIC DEFAULT 0.8,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    whatsapp_trigger_low_confidence BOOLEAN DEFAULT false,
    whatsapp_trigger_purchase_keywords TEXT[],
    whatsapp_trigger_project_keywords TEXT[],
    whatsapp_trigger_expensive_product BOOLEAN DEFAULT false,
    system_prompt TEXT,
    proactivity_level TEXT
);

CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC NOT NULL DEFAULT 0,
    conversion_rate NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.discount_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    scope_type TEXT CHECK (scope_type IN ('all_products', 'specific_products', 'specific_categories', 'specific_manufacturers')),
    discount_calculation_type TEXT CHECK (discount_calculation_type IN ('percentage', 'fixed_amount')),
    discount_value NUMERIC NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scope_data JSONB,
    application_type TEXT,
    role TEXT,
    customers TEXT[],
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.nab_market (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_algorithm_sql TEXT,
    system_prompt_template TEXT,
    result_component_config JSONB,
    cache_expiration_days INTEGER DEFAULT 30,
    price_threshold_usd NUMERIC,
    ignore_stock_count BOOLEAN DEFAULT false,
    logistics_rules_prompt TEXT,
    intent_mapping JSONB,
    technical_bridge JSONB,
    custom_stop_words TEXT[],
    product_page_prompt TEXT
);

CREATE TABLE IF NOT EXISTS public.shipping_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_rate NUMERIC NOT NULL DEFAULT 5.0,
    spread_percentage NUMERIC NOT NULL DEFAULT 0,
    weight_factor NUMERIC NOT NULL DEFAULT 1.0,
    fixed_import_fee NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cache_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mi_expiration_days INTEGER DEFAULT 30,
    product_search_cache_expiration_days INTEGER DEFAULT 7,
    product_cache_expiration_days INTEGER DEFAULT 14,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.avpro_keywords (
    keyword TEXT PRIMARY KEY,
    category TEXT,
    weight NUMERIC DEFAULT 1.0,
    is_blocking BOOLEAN DEFAULT false,
    added_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
    ip TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    bucket TEXT NOT NULL,
    PRIMARY KEY (ip, endpoint, bucket)
);

CREATE SEQUENCE IF NOT EXISTS public.ai_rate_limits_id_seq;

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
    id INTEGER PRIMARY KEY DEFAULT nextval('public.ai_rate_limits_id_seq')
);

-- Group 2: Referencing Tables
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    description TEXT,
    price_brl NUMERIC,
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    ncm TEXT,
    weight NUMERIC,
    dimensions TEXT,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_special BOOLEAN DEFAULT false,
    manufacturer_id UUID REFERENCES public.manufacturers(id) ON DELETE SET NULL,
    price_usd NUMERIC,
    price_cost NUMERIC,
    technical_info TEXT,
    is_discontinued BOOLEAN DEFAULT false,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    manual_related_ids UUID[],
    ai_related_ids UUID[],
    price_nationalized_sales NUMERIC,
    price_nationalized_cost NUMERIC,
    price_nationalized_currency TEXT DEFAULT 'BRL',
    rejected_related_ids UUID[],
    price_usa_rebate NUMERIC,
    price_cost_rebate NUMERIC,
    date_rebate TIMESTAMPTZ,
    fts_vector TSVECTOR,
    search_text TEXT,
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('portuguese', coalesce(sku, '')), 'A') ||
        setweight(to_tsvector('portuguese', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('portuguese', coalesce(technical_info, '')), 'C')
    ) STORED
);

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    phone TEXT,
    date_of_birth DATE,
    gender TEXT,
    company_name TEXT,
    profile_photo_url TEXT,
    cpf TEXT,
    role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'b2b')),
    bio TEXT,
    last_login TIMESTAMPTZ,
    two_factor_enabled BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
    email TEXT UNIQUE,
    billing_address JSONB,
    shipping_address JSONB,
    is_imported BOOLEAN DEFAULT false,
    has_migrated BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.exchange_rate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usd_to_brl NUMERIC NOT NULL,
    spread_percentage NUMERIC NOT NULL DEFAULT 0,
    spread_type TEXT DEFAULT 'percentage',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    login_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    logout_timestamp TIMESTAMPTZ,
    page_viewed TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id TEXT
);

CREATE TABLE IF NOT EXISTS public.price_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_rate NUMERIC NOT NULL DEFAULT 5.0,
    exchange_spread NUMERIC NOT NULL DEFAULT 0,
    freight_per_kg_usd NUMERIC NOT NULL DEFAULT 0,
    weight_margin NUMERIC NOT NULL DEFAULT 0,
    markup NUMERIC NOT NULL DEFAULT 1.0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    setting_value_numeric NUMERIC
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Auth User
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
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Admin"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.customers (user_id, email, full_name, role)
    VALUES (new_user_id, 'plynchusa@gmail.com', 'Admin User', 'admin')
    ON CONFLICT (email) DO NOTHING;
  END IF;
END $$;
