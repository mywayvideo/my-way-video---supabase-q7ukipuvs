DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS public.conversation_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        session_id UUID NOT NULL,
        query TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_conv_history_session_id ON public.conversation_history(session_id);
    CREATE INDEX IF NOT EXISTS idx_conv_history_created_at ON public.conversation_history(created_at DESC);

    ALTER TABLE public.conversation_history ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Auth read own history" ON public.conversation_history;
    CREATE POLICY "Auth read own history" ON public.conversation_history
        FOR SELECT TO authenticated USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Auth insert own history" ON public.conversation_history;
    CREATE POLICY "Auth insert own history" ON public.conversation_history
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

END $$;
