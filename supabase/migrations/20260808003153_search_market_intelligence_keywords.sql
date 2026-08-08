-- Replace search_market_intelligence to accept an array of keywords instead of a single search_term.
-- Matches records where ANY keyword appears (case-insensitive ILIKE) across title, raw_content,
-- ai_summary, source_url, and event_name. Results are ordered by match count (DESC) then created_at (DESC).

DROP FUNCTION IF EXISTS public.search_market_intelligence(text);

CREATE OR REPLACE FUNCTION public.search_market_intelligence(keywords text[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_keywords text[];
  v_results json;
BEGIN
  -- Normalize and deduplicate keywords; drop empties
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
      mi.created_at
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
