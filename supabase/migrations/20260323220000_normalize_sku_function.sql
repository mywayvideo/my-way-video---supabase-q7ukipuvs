CREATE OR REPLACE FUNCTION public.normalize_sku(sku text)
RETURNS text AS $$
BEGIN
  RETURN upper(regexp_replace(sku, '[^a-zA-Z0-9]', '', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
