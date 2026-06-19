-- Fix RLS policy for avpro_keywords to use check_is_admin()
DROP POLICY IF EXISTS "avpro_keywords_admin_all" ON public.avpro_keywords;
DROP POLICY IF EXISTS "avpro_keywords_no_access_authenticated" ON public.avpro_keywords;

CREATE POLICY "avpro_keywords_admin_all" ON public.avpro_keywords
  FOR ALL TO authenticated USING (check_is_admin()) WITH CHECK (check_is_admin());
