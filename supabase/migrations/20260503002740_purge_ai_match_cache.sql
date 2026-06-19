DO $$
BEGIN
  DELETE FROM public.product_search_cache WHERE product_name = 'AI Match';
END $$;
