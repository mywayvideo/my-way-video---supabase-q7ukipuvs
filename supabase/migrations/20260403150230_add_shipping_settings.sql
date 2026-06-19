DO $$
BEGIN
  INSERT INTO public.app_settings (setting_key, setting_value)
  VALUES 
    ('warehouse_location', '{"address": "1735 NW 79th Av., Doral, FL 33126", "latitude": 25.8067, "longitude": -80.2789}'),
    ('shipping_miami_ranges', '[{"min_km": 0, "max_km": 15, "cost_usd": 25}, {"min_km": 15, "max_km": 30, "cost_usd": 35}, {"min_km": 30, "max_km": 50, "cost_usd": 50}]'),
    ('shipping_sao_paulo_formula', '{"weight_price_per_kg": 5.50, "value_percentage": 2.5}')
  ON CONFLICT (setting_key) DO UPDATE 
  SET setting_value = EXCLUDED.setting_value;
END $$;
