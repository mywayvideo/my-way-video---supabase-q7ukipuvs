CREATE OR REPLACE FUNCTION public.check_tmp_indexing_log()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_info TEXT;
BEGIN
  SELECT info INTO v_info FROM public._tmp_indexing_log ORDER BY id DESC LIMIT 1;
  RETURN v_info;
END;
$$;
