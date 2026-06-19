DO $$
BEGIN
  INSERT INTO public.app_settings (setting_key, setting_value)
  VALUES ('shipping_usa_formula', '{"base_cost": 25.0, "weight_price_per_kg": 3.0, "value_percentage": 1.5}')
  ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
END $$;
