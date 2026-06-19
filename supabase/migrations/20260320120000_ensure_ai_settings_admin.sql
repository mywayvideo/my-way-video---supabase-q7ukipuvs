DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS public.ai_agent_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        price_threshold_usd NUMERIC(12,2) DEFAULT 5000,
        whatsapp_trigger_keywords TEXT[] DEFAULT ARRAY['comprar', 'orçamento', 'quanto custa', 'disponível', 'preço', 'tabela de preços', 'cotação', 'desconto', 'promoção'],
        max_web_search_attempts INTEGER DEFAULT 2,
        confidence_threshold_for_whatsapp TEXT DEFAULT 'low',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow authenticated read on ai_agent_settings" ON public.ai_agent_settings;
    CREATE POLICY "Allow authenticated read on ai_agent_settings"
        ON public.ai_agent_settings FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Allow admin write on ai_agent_settings" ON public.ai_agent_settings;
    CREATE POLICY "Allow admin write on ai_agent_settings"
        ON public.ai_agent_settings FOR ALL TO authenticated
        USING (
            (auth.jwt() ->> 'role') = 'admin' OR
            (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        );

    INSERT INTO public.ai_agent_settings (id, price_threshold_usd, max_web_search_attempts, confidence_threshold_for_whatsapp)
    VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 5000, 2, 'low')
    ON CONFLICT (id) DO NOTHING;
END $$;
