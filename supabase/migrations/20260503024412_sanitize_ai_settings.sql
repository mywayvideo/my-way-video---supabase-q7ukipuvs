DO $$
DECLARE
  keep_ai_settings_id uuid;
  keep_ai_agent_settings_id uuid;
BEGIN
  -- 1. Sanitize ai_settings
  SELECT id INTO keep_ai_settings_id FROM public.ai_settings ORDER BY created_at DESC LIMIT 1;
  
  IF keep_ai_settings_id IS NOT NULL THEN
    DELETE FROM public.ai_settings WHERE id != keep_ai_settings_id;
  ELSE
    INSERT INTO public.ai_settings (
      cache_expiration_days, price_threshold_usd, search_algorithm_sql, result_component_config,
      ignore_stock_count, logistics_rules_prompt, system_prompt_template, intent_mapping,
      technical_bridge, custom_stop_words, product_page_prompt
    ) VALUES (
      30, 5000, '', '{}'::jsonb, true, '', '', '[]'::jsonb, '[]'::jsonb, '', ''
    );
  END IF;

  -- 2. Sanitize ai_agent_settings
  SELECT id INTO keep_ai_agent_settings_id FROM public.ai_agent_settings ORDER BY created_at DESC LIMIT 1;
  
  IF keep_ai_agent_settings_id IS NOT NULL THEN
    DELETE FROM public.ai_agent_settings WHERE id != keep_ai_agent_settings_id;
  ELSE
    INSERT INTO public.ai_agent_settings (
      whatsapp_trigger_low_confidence, whatsapp_trigger_purchase_keywords, whatsapp_trigger_project_keywords,
      whatsapp_trigger_expensive_product, whatsapp_trigger_keywords, system_prompt,
      confidence_threshold_for_whatsapp, max_web_search_attempts, proactivity_level
    ) VALUES (
      true, true, true, true, ARRAY['comprar', 'orçamento', 'quanto custa', 'disponível', 'preço'], '', 'low', 2, 5
    );
  END IF;
END $$;
