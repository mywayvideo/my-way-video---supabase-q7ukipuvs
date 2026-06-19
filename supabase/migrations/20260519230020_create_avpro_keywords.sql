CREATE TABLE IF NOT EXISTS public.avpro_keywords (
    keyword TEXT PRIMARY KEY,
    category TEXT,
    weight NUMERIC NOT NULL DEFAULT 1.0,
    is_blocking BOOLEAN NOT NULL DEFAULT false,
    added_by TEXT NOT NULL DEFAULT 'admin',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.avpro_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_avpro_keywords" ON public.avpro_keywords;
CREATE POLICY "admin_all_avpro_keywords" ON public.avpro_keywords
    FOR ALL TO authenticated
    USING (check_is_admin())
    WITH CHECK (check_is_admin());

DROP POLICY IF EXISTS "public_read_avpro_keywords" ON public.avpro_keywords;
CREATE POLICY "public_read_avpro_keywords" ON public.avpro_keywords
    FOR SELECT TO public
    USING (true);

CREATE OR REPLACE FUNCTION public.handle_avpro_keywords_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_avpro_keywords_updated_at ON public.avpro_keywords;
CREATE TRIGGER set_avpro_keywords_updated_at
BEFORE UPDATE ON public.avpro_keywords
FOR EACH ROW
EXECUTE FUNCTION public.handle_avpro_keywords_updated_at();
