ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general';
