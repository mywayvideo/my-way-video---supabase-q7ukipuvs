CREATE OR REPLACE FUNCTION public.batch_recalculate_price_brl(
  p_product_ids UUID[] DEFAULT NULL,
  p_manufacturer_ids UUID[] DEFAULT NULL,
  p_category_ids UUID[] DEFAULT NULL,
  p_all BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
AS $$
DECLARE
  v_markup NUMERIC;
  v_freight_per_kg_usd NUMERIC;
  v_weight_margin NUMERIC;
  v_updated_count INTEGER := 0;
  v_category_names TEXT[] := '{}'::TEXT[];
BEGIN
  SELECT markup, freight_per_kg_usd, weight_margin
  INTO v_markup, v_freight_per_kg_usd, v_weight_margin
  FROM public.price_settings
  LIMIT 1;

  IF NOT FOUND OR v_markup IS NULL OR v_markup <= 0 OR v_freight_per_kg_usd IS NULL OR v_freight_per_kg_usd <= 0 THEN
    RETURN 0;
  END IF;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) IS NOT NULL THEN
    SELECT COALESCE(array_agg(name), '{}'::TEXT[]) INTO v_category_names
    FROM public.categories
    WHERE id = ANY(p_category_ids);
  END IF;

  UPDATE public.products p
  SET price_brl = sub.new_price_brl
  FROM (
    SELECT
      mp.id,
      CASE
        WHEN COALESCE(mp.weight, 0) > 0 AND
             CASE
               WHEN COALESCE(mp.price_usa_rebate, 0) > 0 AND (mp.date_rebate IS NULL OR mp.date_rebate >= NOW()) THEN COALESCE(mp.price_usa_rebate, 0)
               ELSE COALESCE(mp.price_usd, 0)
             END > 0
        THEN (
          CASE
            WHEN COALESCE(mp.price_usa_rebate, 0) > 0 AND (mp.date_rebate IS NULL OR mp.date_rebate >= NOW()) THEN COALESCE(mp.price_usa_rebate, 0)
            ELSE COALESCE(mp.price_usd, 0)
          END +
          ((COALESCE(mp.weight, 0) + COALESCE(v_weight_margin, 0)) / 2.20462) * v_freight_per_kg_usd
        ) / v_markup
        ELSE NULL
      END AS new_price_brl
    FROM public.products mp
    WHERE
      CASE
        WHEN p_all THEN TRUE
        WHEN p_product_ids IS NOT NULL AND array_length(p_product_ids, 1) IS NOT NULL THEN
          mp.id = ANY(p_product_ids)
        WHEN p_manufacturer_ids IS NOT NULL AND array_length(p_manufacturer_ids, 1) IS NOT NULL
          AND p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) IS NOT NULL THEN
          mp.manufacturer_id = ANY(p_manufacturer_ids)
          AND (mp.category_id = ANY(p_category_ids) OR mp.category = ANY(v_category_names))
        WHEN p_manufacturer_ids IS NOT NULL AND array_length(p_manufacturer_ids, 1) IS NOT NULL THEN
          mp.manufacturer_id = ANY(p_manufacturer_ids)
        WHEN p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) IS NOT NULL THEN
          mp.category_id = ANY(p_category_ids) OR mp.category = ANY(v_category_names)
        ELSE FALSE
      END
  ) sub
  WHERE p.id = sub.id AND sub.new_price_brl IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.batch_recalculate_price_brl(UUID[], UUID[], UUID[], BOOLEAN) TO authenticated;
