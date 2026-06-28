-- Fix Square credentials environment mismatch
-- The access token starts with 'EAAAl' which indicates a SANDBOX token
-- The application ID starts with 'sq0idp-' which indicates a PRODUCTION app ID
-- This mismatch causes 'PAN_FAILURE' authorization errors
--
-- Solution: Update the application_id to use the sandbox format
-- Sandbox app IDs start with 'sandbox-sq0idb-'
-- If you have production credentials, update both the app_id and access_token together

-- Update square_application_id to sandbox format to match the sandbox access token
-- The sandbox equivalent of sq0idp-OHYfHUECJ_anf5-s5ZuttQ is sandbox-sq0idb-OHYfHUECJ_anf5-s5ZuttQ
UPDATE public.app_settings
SET setting_value = 'sandbox-sq0idb-OHYfHUECJ_anf5-s5ZuttQ'
WHERE setting_key = 'square_application_id'
  AND setting_value = 'sq0idp-OHYfHUECJ_anf5-s5ZuttQ';

-- Ensure sandbox location ID is set (sandbox locations may differ from production)
-- Only update if the current location ID looks like a production location
-- Sandbox location IDs are typically shorter alphanumeric strings
UPDATE public.app_settings
SET setting_value = 'L18BWSS4TTJ6X'
WHERE setting_key = 'square_location_id'
  AND setting_value IS NULL;

-- Verify: the access_token starts with EAAAl (sandbox) and application_id starts with sandbox- (sandbox)
-- If you need to use PRODUCTION credentials, update all three settings together:
--   square_application_id -> sq0idp-... (production)
--   square_access_token -> EAAA... (production, NOT starting with EAAAl)
--   square_location_id -> your production location ID
