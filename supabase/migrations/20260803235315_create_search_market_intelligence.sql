-- Create a new, standalone function to search market_intelligence by title and raw_content.
-- This does NOT touch execute_ai_search_v3 in any way.
-- Returns a JSON array of objects containing id, title, ai_summary, source_url, event_name, and created_at for matching rows.
-- If no rows match, returns an empty JSON array ('[]').

CREATE OR REPLACE FUNCTION public.search_market_intelligence(search_term text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_term text;
  v_results json;
BEGIN
  v_term := trim(search_term);

  IF v_term IS NULL OR v_term = '' THEN
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
    WHERE
      mi.title ILIKE '%' || v_term || '%'
      OR mi.raw_content ILIKE '%' || v_term || '%'
    ORDER BY
      mi.created_at DESC
  ) r;

  RETURN v_results;
END;
$function$;
