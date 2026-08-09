-- Add referenced_product_ids column to market_intelligence
ALTER TABLE public.market_intelligence
  ADD COLUMN IF NOT EXISTS referenced_product_ids UUID[] DEFAULT '{}';

-- Update search_market_intelligence to include referenced_product_ids in the result
CREATE OR REPLACE FUNCTION public.search_market_intelligence(keywords text[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_keywords text[];
  v_results json;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT kw), ARRAY[]::text[])
  INTO v_keywords
  FROM (
    SELECT LOWER(TRIM(k)) AS kw
    FROM unnest(COALESCE(keywords, ARRAY[]::text[])) AS k
    WHERE LENGTH(TRIM(k)) > 0
  ) sub;

  IF v_keywords IS NULL OR array_length(v_keywords, 1) IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
  INTO v_results
  FROM (
    SELECT
      mi.id,
      mi.title,
      mi.ai_summary,
      mi.source_url,
      mi.event_name,
      mi.created_at,
      mi.referenced_product_ids
    FROM public.market_intelligence mi
    WHERE EXISTS (
      SELECT 1
      FROM unnest(v_keywords) AS kw
      WHERE
        mi.title ILIKE '%' || kw || '%'
        OR mi.raw_content ILIKE '%' || kw || '%'
        OR COALESCE(mi.ai_summary, '') ILIKE '%' || kw || '%'
        OR COALESCE(mi.source_url, '') ILIKE '%' || kw || '%'
        OR COALESCE(mi.event_name, '') ILIKE '%' || kw || '%'
    )
    ORDER BY
      (
        SELECT COUNT(*)::int
        FROM unnest(v_keywords) AS kw
        WHERE
          mi.title ILIKE '%' || kw || '%'
          OR mi.raw_content ILIKE '%' || kw || '%'
          OR COALESCE(mi.ai_summary, '') ILIKE '%' || kw || '%'
          OR COALESCE(mi.source_url, '') ILIKE '%' || kw || '%'
          OR COALESCE(mi.event_name, '') ILIKE '%' || kw || '%'
      ) DESC,
      mi.created_at DESC
  ) r;

  RETURN v_results;
END;
$$;
