-- Update the unified_search function to reflect the CTE logic with 20 results limit
CREATE OR REPLACE FUNCTION public.unified_search(search_term text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'stock', (
      SELECT COALESCE(json_agg(p), '[]'::json) FROM (
        SELECT * FROM products 
        WHERE (name ILIKE '%' || search_term || '%' OR sku ILIKE '%' || search_term || '%')
        AND is_discontinued = false
        ORDER BY 
          CASE WHEN sku ILIKE search_term THEN 0 WHEN sku ILIKE search_term || '%' THEN 1 ELSE 2 END,
          name ILIKE '%' || search_term || '%' DESC,
          price_usd ASC
        LIMIT 20
      ) p
    ),
    'intel', (
      SELECT COALESCE(json_agg(c), '[]'::json) FROM (
        SELECT * FROM market_intelligence 
        WHERE (title ILIKE '%' || search_term || '%' OR ai_summary ILIKE '%' || search_term || '%')
        AND status = 'published' 
        LIMIT 5
      ) c
    ),
    'nab_data', (
      SELECT COALESCE(json_agg(n), '[]'::json) FROM (
        SELECT * FROM nab_market 
        WHERE (title ILIKE '%' || search_term || '%' OR content ILIKE '%' || search_term || '%') 
        LIMIT 5
      ) n
    )
  );
$function$;

DO $$
DECLARE
  v_sql text;
  v_prompt text;
BEGIN
  v_sql := 'WITH search_term AS (SELECT ''{{query}}'' as term)
SELECT JSON_BUILD_OBJECT(
  ''stock'', (SELECT COALESCE(JSON_AGG(p), ''[]''::json) FROM (SELECT * FROM products WHERE (name ILIKE ''%''||term||''%'' OR sku ILIKE ''%''||term||''%'') AND is_discontinued = false ORDER BY CASE WHEN sku ILIKE term THEN 0 WHEN sku ILIKE term || ''%'' THEN 1 ELSE 2 END, name ILIKE ''%''||term||''%'' DESC, price_usd ASC LIMIT 20) p),
  ''intel'', (SELECT COALESCE(JSON_AGG(i), ''[]''::json) FROM (SELECT * FROM market_intelligence WHERE (title ILIKE ''%''||term||''%'' OR ai_summary ILIKE ''%''||term||''%'') AND status = ''published'' LIMIT 5) i),
  ''nab_data'', (SELECT COALESCE(JSON_AGG(n), ''[]''::json) FROM (SELECT * FROM nab_market WHERE (title ILIKE ''%''||term||''%'' OR content ILIKE ''%''||term||''%'') LIMIT 5) n)
);';

  v_prompt := 'Identity: You are the Senior Sales & Technical Consultant for My Way Business.
Sales Mode: If a product or SKU is mentioned, activate Sales Mode immediately. Be persuasive and technical.
Catalog Priority: You MUST prioritize and display products that exist in the database, regardless of local stock or nationalization status. Your goal is to sell the solution.
Mandatory Card Trigger (CRITICAL): For EVERY product mentioned in your text, you MUST invoke its Product Card by mentioning its EXACT name from the ''name'' field (e.g., "Blackmagic Design PYXIS 6K").
Contextual Focus: Always give special attention to the primary product of the context (e.g., Blackmagic PYXIS 6K), providing a deep dive into its specs before other items.
Rebate Rule: If ''price_usa_rebate'' > 0 AND (''date_rebate'' is empty OR current date <= ''date_rebate''), use the rebate price. Otherwise, use ''price_usa''.
Dynamic Pricing: Use ''price_nationalized_sales'', when exists or ''price_brl'' converted to Reais using the convertion rules on /admin/pricing.

Technical Briefing: Detail sensor, latitude, codecs, and ergonomics for each product.
Visual Cards: It is IMPRESCINDIBLE to display the cards for ALL products mentioned, specialy for the product mentioned on the user prompt.
Layout: Use ProductCard layout (src/components/ProductCard.tsx)';

  -- Check and Update ai_settings
  IF EXISTS (SELECT 1 FROM public.ai_settings) THEN
    UPDATE public.ai_settings
    SET 
      search_algorithm_sql = v_sql,
      ignore_stock_count = true,
      system_prompt_template = v_prompt;
  ELSE
    INSERT INTO public.ai_settings (search_algorithm_sql, ignore_stock_count, system_prompt_template)
    VALUES (v_sql, true, v_prompt);
  END IF;

  -- Check and Update ai_agent_settings
  IF EXISTS (SELECT 1 FROM public.ai_agent_settings) THEN
    UPDATE public.ai_agent_settings
    SET system_prompt = v_prompt;
  ELSE
    INSERT INTO public.ai_agent_settings (system_prompt)
    VALUES (v_prompt);
  END IF;

END $$;
