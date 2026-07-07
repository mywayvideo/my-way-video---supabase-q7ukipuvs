CREATE OR REPLACE FUNCTION public.calculate_product_price_brl()
RETURNS trigger AS $$
DECLARE
  ps_markup NUMERIC;
  ps_freight_per_kg_usd NUMERIC;
  ps_weight_margin NUMERIC;
  v_price_usd NUMERIC;
  v_weight NUMERIC;
  v_rebate NUMERIC;
  v_date_rebate TIMESTAMPTZ;
  v_effective_price NUMERIC;
  v_weight_kg NUMERIC;
  v_shipping_cost NUMERIC;
  v_total_usd NUMERIC;
BEGIN
  SELECT markup, freight_per_kg_usd, weight_margin
  INTO ps_markup, ps_freight_per_kg_usd, ps_weight_margin
  FROM public.price_settings
  LIMIT 1;

  IF NOT FOUND OR ps_markup IS NULL OR ps_markup <= 0 OR ps_freight_per_kg_usd IS NULL OR ps_freight_per_kg_usd <= 0 THEN
    RETURN NEW;
  END IF;

  v_price_usd := COALESCE(NEW.price_usd, 0);
  v_weight := COALESCE(NEW.weight, 0);
  v_rebate := COALESCE(NEW.price_usa_rebate, 0);
  v_date_rebate := NEW.date_rebate;

  v_effective_price := v_price_usd;
  IF v_rebate > 0 THEN
    IF v_date_rebate IS NULL THEN
      v_effective_price := v_rebate;
    ELSIF v_date_rebate >= NOW() THEN
      v_effective_price := v_rebate;
    END IF;
  END IF;

  IF v_effective_price > 0 AND v_weight > 0 THEN
    v_weight_kg := (v_weight + COALESCE(ps_weight_margin, 0)) / 2.20462;
    v_shipping_cost := v_weight_kg * ps_freight_per_kg_usd;
    v_total_usd := (v_effective_price + v_shipping_cost) / ps_markup;
    NEW.price_brl := v_total_usd;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_calculate_product_price_brl ON public.products;

CREATE TRIGGER trg_calculate_product_price_brl
  BEFORE INSERT OR UPDATE OF price_usd, weight, price_usa_rebate, date_rebate ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.calculate_product_price_brl();
