-- Allow anonymous users to select, insert, and update sessions for tracking
DROP POLICY IF EXISTS "Enable insert for anonymous users" ON public.user_sessions;
CREATE POLICY "Enable insert for anonymous users" ON public.user_sessions
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Enable select for anonymous users" ON public.user_sessions;
CREATE POLICY "Enable select for anonymous users" ON public.user_sessions
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Enable update for anonymous users" ON public.user_sessions;
CREATE POLICY "Enable update for anonymous users" ON public.user_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Allow authenticated users to select, insert, and update sessions for tracking
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.user_sessions;
CREATE POLICY "Enable insert for authenticated users" ON public.user_sessions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.user_sessions;
CREATE POLICY "Enable select for authenticated users" ON public.user_sessions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.user_sessions;
CREATE POLICY "Enable update for authenticated users" ON public.user_sessions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
