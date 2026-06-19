-- CREATE app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES auth.users(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;
CREATE POLICY "Anyone can read app_settings" ON public.app_settings
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admin only insert app_settings" ON public.app_settings;
CREATE POLICY "Admin only insert app_settings" ON public.app_settings
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "Admin only update app_settings" ON public.app_settings;
CREATE POLICY "Admin only update app_settings" ON public.app_settings
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "No one delete app_settings" ON public.app_settings;
CREATE POLICY "No one delete app_settings" ON public.app_settings
    FOR DELETE TO public USING (false);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON public.app_settings(setting_key);

INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('collaborators_can_assisted_checkout', 'false')
ON CONFLICT (setting_key) DO NOTHING;

-- CREATE payment_tokens
CREATE TABLE IF NOT EXISTS public.payment_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    order_id UUID REFERENCES public.orders(id) NOT NULL,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ
);

ALTER TABLE public.payment_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own tokens or admins" ON public.payment_tokens;
CREATE POLICY "Users can read own tokens or admins" ON public.payment_tokens
    FOR SELECT TO authenticated USING (
        auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "Admins or collaborators can insert tokens" ON public.payment_tokens;
CREATE POLICY "Admins or collaborators can insert tokens" ON public.payment_tokens
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role IN ('admin', 'collaborator'))
    );

DROP POLICY IF EXISTS "Admins can update tokens" ON public.payment_tokens;
CREATE POLICY "Admins can update tokens" ON public.payment_tokens
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.customers WHERE user_id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "No one delete payment_tokens" ON public.payment_tokens;
CREATE POLICY "No one delete payment_tokens" ON public.payment_tokens
    FOR DELETE TO public USING (false);

CREATE INDEX IF NOT EXISTS idx_payment_tokens_token ON public.payment_tokens(token);
CREATE INDEX IF NOT EXISTS idx_payment_tokens_order_id ON public.payment_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_tokens_user_id ON public.payment_tokens(user_id);
