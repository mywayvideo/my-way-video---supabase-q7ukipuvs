DO $$
DECLARE
  affected_rows INT;
  remaining_rows INT;
BEGIN
  -- 1. Standardize all category values in the products table to English
  UPDATE public.products 
  SET category = 'Cameras' 
  WHERE category = 'Câmeras';
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Updated % rows from Câmeras to Cameras', affected_rows;

  -- Additional common standardizations to ensure English categories
  UPDATE public.products SET category = 'Accessories' WHERE category = 'Acessórios';
  UPDATE public.products SET category = 'Converters' WHERE category = 'Conversores';
  
  -- 2 & 3. Validate no "Câmeras" records remain after migration
  SELECT COUNT(*) INTO remaining_rows FROM public.products WHERE category = 'Câmeras';
  
  IF remaining_rows > 0 THEN
    -- This exception will cause the DO block to fail and roll back the transaction
    RAISE EXCEPTION 'Validation failed: % records with category Câmeras still remain. Rolling back.', remaining_rows;
  END IF;
  
  RAISE NOTICE 'Migration completed successfully. Category names standardized.';
END $$;
