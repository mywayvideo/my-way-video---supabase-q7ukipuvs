DO $$
BEGIN
    -- Ensure user_sessions exists
    CREATE TABLE IF NOT EXISTS public.user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        session_id TEXT,
        page_viewed TEXT,
        login_timestamp TIMESTAMPTZ DEFAULT NOW(),
        logout_timestamp TIMESTAMPTZ
    );

    ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS session_id TEXT;
    
    -- Ensure RLS is enabled
    ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies to recreate them safely
    DROP POLICY IF EXISTS "Enable insert for anon and authenticated" ON public.user_sessions;
    DROP POLICY IF EXISTS "Enable update for anon and authenticated" ON public.user_sessions;
    DROP POLICY IF EXISTS "Enable select for users" ON public.user_sessions;

    -- Policies
    CREATE POLICY "Enable insert for anon and authenticated" ON public.user_sessions
        FOR INSERT TO public WITH CHECK (true);

    CREATE POLICY "Enable update for anon and authenticated" ON public.user_sessions
        FOR UPDATE TO public USING (true) WITH CHECK (true);

    CREATE POLICY "Enable select for users" ON public.user_sessions
        FOR SELECT TO public USING (true);
END $$;
