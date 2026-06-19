DO $$ 
BEGIN
  -- Create user_sessions table
  CREATE TABLE IF NOT EXISTS public.user_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      login_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      logout_timestamp TIMESTAMPTZ,
      page_viewed TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Enable RLS
  ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Admin full access user_sessions" ON public.user_sessions;
  CREATE POLICY "Admin full access user_sessions" ON public.user_sessions
      FOR ALL
      TO authenticated
      USING (
          EXISTS (
              SELECT 1 FROM public.customers
              WHERE customers.user_id = auth.uid() AND customers.role = 'admin'
          )
      )
      WITH CHECK (
          EXISTS (
              SELECT 1 FROM public.customers
              WHERE customers.user_id = auth.uid() AND customers.role = 'admin'
          )
      );

  DROP POLICY IF EXISTS "Users can insert own sessions" ON public.user_sessions;
  CREATE POLICY "Users can insert own sessions" ON public.user_sessions
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

  DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
  CREATE POLICY "Users can update own sessions" ON public.user_sessions
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id OR user_id IS NULL);

  DROP POLICY IF EXISTS "Anon can insert sessions" ON public.user_sessions;
  CREATE POLICY "Anon can insert sessions" ON public.user_sessions
      FOR INSERT
      TO anon
      WITH CHECK (user_id IS NULL);

  DROP POLICY IF EXISTS "Anon can update sessions" ON public.user_sessions;
  CREATE POLICY "Anon can update sessions" ON public.user_sessions
      FOR UPDATE
      TO anon
      USING (user_id IS NULL);
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_sessions'
  ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
  END IF;
END $$;
