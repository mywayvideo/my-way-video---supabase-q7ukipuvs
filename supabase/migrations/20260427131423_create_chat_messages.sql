CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable insert for all users" ON public.chat_messages;
CREATE POLICY "Enable insert for all users" ON public.chat_messages
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable select for users based on user_id" ON public.chat_messages;
CREATE POLICY "Enable select for users based on user_id" ON public.chat_messages
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
