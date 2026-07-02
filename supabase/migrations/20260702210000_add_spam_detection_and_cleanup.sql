-- Add removal_reason column to customers_staging
ALTER TABLE public.customers_staging ADD COLUMN IF NOT EXISTS removal_reason TEXT;

-- Remove duplicate ids before creating unique index
DELETE FROM public.customers_staging
WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM public.customers_staging
  WHERE id IS NOT NULL
  GROUP BY id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_staging_id ON public.customers_staging(id);

-- ============================================================
-- Spam email validation function
-- Returns: is_spam (definitive), is_borderline (needs name check), reason
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_spam_email(p_email TEXT)
RETURNS TABLE(is_spam BOOLEAN, is_borderline BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_local TEXT;
  v_at_pos INT;
  v_dot_count INT;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN QUERY SELECT true, false, 'Empty Email'::TEXT;
    RETURN;
  END IF;

  v_at_pos := POSITION('@' IN p_email);
  IF v_at_pos = 0 THEN
    RETURN QUERY SELECT true, false, 'Invalid Email Format'::TEXT;
    RETURN;
  END IF;

  v_local := LOWER(SUBSTRING(p_email FROM 1 FOR v_at_pos - 1));

  -- Rule 1: Standard regex format validation
  IF p_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RETURN QUERY SELECT true, false, 'Invalid Email Format'::TEXT;
    RETURN;
  END IF;

  -- Rule 2: Generic prefixes (test, random, user, admin, support)
  IF v_local ~ '^(test|random|user|admin|support)' THEN
    RETURN QUERY SELECT true, false, 'Invalid Email Prefix'::TEXT;
    RETURN;
  END IF;

  -- Rule 3: More than 4 consecutive digits in local part
  IF v_local ~ '[0-9]{5,}' THEN
    RETURN QUERY SELECT true, false, 'Excessive Digits in Email'::TEXT;
    RETURN;
  END IF;

  -- Rule 4: More than 2 dots in local part
  v_dot_count := LENGTH(v_local) - LENGTH(REPLACE(v_local, '.', ''));
  IF v_dot_count > 2 THEN
    RETURN QUERY SELECT true, false, 'Excessive Dots in Email'::TEXT;
    RETURN;
  END IF;

  -- Borderline checks (suspicious but not definitive)
  IF v_local ~ '[0-9]{3,}' THEN
    RETURN QUERY SELECT false, true, 'Borderline: Multiple Consecutive Digits'::TEXT;
    RETURN;
  END IF;

  IF v_dot_count = 2 THEN
    RETURN QUERY SELECT false, true, 'Borderline: Multiple Dots'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, false, NULL::TEXT;
END;
$$;

-- ============================================================
-- Spam name validation function ("Esdrúxulo" check)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_spam_name(p_name TEXT)
RETURNS TABLE(is_spam BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name TEXT;
  v_alpha TEXT;
  v_lower TEXT;
  v_vowels INT;
  v_alpha_len INT;
  v_remaining TEXT;
BEGIN
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RETURN QUERY SELECT true, 'Empty Name'::TEXT;
    RETURN;
  END IF;

  v_name := TRIM(p_name);
  v_lower := LOWER(v_name);
  v_alpha := REGEXP_REPLACE(v_lower, '[^a-z]', '', 'g');
  v_alpha_len := LENGTH(v_alpha);

  -- Rule 1: Contains numbers
  IF v_name ~ '[0-9]' THEN
    RETURN QUERY SELECT true, 'Suspicious Name Pattern: Contains Numbers'::TEXT;
    RETURN;
  END IF;

  -- Rule 2: Unusual special characters (emojis, math symbols, etc.)
  -- Strip allowed: letters (incl. accented), spaces, hyphens, apostrophes, periods
  v_remaining := REGEXP_REPLACE(v_name, '[a-zA-ZÀ-ÿ''\-\. ]', '', 'g');
  v_remaining := REGEXP_REPLACE(v_remaining, '[0-9]', '', 'g');
  IF LENGTH(v_remaining) > 0 THEN
    RETURN QUERY SELECT true, 'Suspicious Name Pattern: Unusual Characters'::TEXT;
    RETURN;
  END IF;

  -- Rule 3: Lacks vowels entirely
  v_vowels := LENGTH(REGEXP_REPLACE(v_alpha, '[^aeiou]', '', 'g'));
  IF v_alpha_len > 0 AND v_vowels = 0 THEN
    RETURN QUERY SELECT true, 'Suspicious Name Pattern: No Vowels'::TEXT;
    RETURN;
  END IF;

  -- Rule 4: Common gibberish keyboard patterns
  IF v_lower ~ '(asdf|qwer|zxcv|qwerty|asdfgh|123456|abcdef|ghijkl|poiuy|lkjhg|mnbvc|qazwsx)' THEN
    RETURN QUERY SELECT true, 'Suspicious Name Pattern: Gibberish'::TEXT;
    RETURN;
  END IF;

  -- Rule 5: Excessive character repetition (4+ consecutive identical chars)
  IF v_name ~ '(.)\1{3,}' THEN
    RETURN QUERY SELECT true, 'Suspicious Name Pattern: Excessive Repetition'::TEXT;
    RETURN;
  END IF;

  -- Rule 6: Low vowel ratio for longer names (possible gibberish)
  IF v_alpha_len >= 6 AND v_vowels::FLOAT / v_alpha_len::FLOAT < 0.15 THEN
    RETURN QUERY SELECT true, 'Suspicious Name Pattern: Low Vowel Ratio'::TEXT;
    RETURN;
  END IF;

  -- Rule 7: Single-word, consonant-heavy (>= 5 chars, <= 1 vowel, no space)
  IF v_alpha_len >= 5 AND v_name !~ ' ' AND v_vowels <= 1 THEN
    RETURN QUERY SELECT true, 'Suspicious Name Pattern: Consonant Heavy'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::TEXT;
END;
$$;

-- ============================================================
-- Cleanup function: moves spam records to customers_staging
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_spam_customers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_spam_count INT := 0;
  v_kept_count INT := 0;
  v_total INT := 0;
  v_email_check RECORD;
  v_name_check RECORD;
  v_reason TEXT;
  r RECORD;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.customers;

  FOR r IN SELECT * FROM public.customers LOOP
    v_reason := NULL;

    SELECT * INTO v_email_check FROM public.check_spam_email(COALESCE(r.email, ''));

    IF v_email_check.is_spam THEN
      v_reason := v_email_check.reason;
    ELSIF v_email_check.is_borderline THEN
      SELECT * INTO v_name_check FROM public.check_spam_name(COALESCE(r.full_name, ''));
      IF v_name_check.is_spam THEN
        v_reason := v_name_check.reason;
      END IF;
    END IF;

    -- Also check name if email is empty/null
    IF v_reason IS NULL AND (r.email IS NULL OR r.email = '') THEN
      SELECT * INTO v_name_check FROM public.check_spam_name(COALESCE(r.full_name, ''));
      IF v_name_check.is_spam THEN
        v_reason := v_name_check.reason;
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      INSERT INTO public.customers_staging (
        id, user_id, full_name, created_at, updated_at, phone,
        date_of_birth, gender, company_name, profile_photo_url, cpf,
        role, bio, last_login, two_factor_enabled, status, email,
        billing_address, shipping_address, is_imported, has_migrated,
        removal_reason
      ) VALUES (
        r.id, r.user_id, r.full_name, r.created_at, r.updated_at, r.phone,
        r.date_of_birth, r.gender, r.company_name, r.profile_photo_url, r.cpf,
        r.role, r.bio, r.last_login, r.two_factor_enabled, r.status, r.email,
        r.billing_address, r.shipping_address, r.is_imported, r.has_migrated,
        v_reason
      )
      ON CONFLICT (id) DO UPDATE SET removal_reason = EXCLUDED.removal_reason;

      DELETE FROM public.customers WHERE id = r.id;
      v_spam_count := v_spam_count + 1;
    ELSE
      v_kept_count := v_kept_count + 1;
    END IF;
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'total_processed', v_total,
    'spam_removed', v_spam_count,
    'kept', v_kept_count
  );
END;
$$;

-- ============================================================
-- BEFORE INSERT trigger: blocks spam signups
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_customer_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email_check RECORD;
  v_name_check RECORD;
BEGIN
  -- Check email if present
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    SELECT * INTO v_email_check FROM public.check_spam_email(NEW.email);

    IF v_email_check.is_spam THEN
      RAISE EXCEPTION 'Signup blocked: %', v_email_check.reason;
    END IF;

    IF v_email_check.is_borderline THEN
      SELECT * INTO v_name_check FROM public.check_spam_name(COALESCE(NEW.full_name, ''));
      IF v_name_check.is_spam THEN
        RAISE EXCEPTION 'Signup blocked: %', v_name_check.reason;
      END IF;
    END IF;
  END IF;

  -- Always check name if present
  IF NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN
    SELECT * INTO v_name_check FROM public.check_spam_name(NEW.full_name);
    IF v_name_check.is_spam THEN
      RAISE EXCEPTION 'Signup blocked: %', v_name_check.reason;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_customer_signup_trigger ON public.customers;
CREATE TRIGGER validate_customer_signup_trigger
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_signup();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_spam_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_spam_name(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_spam_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customer_signup() TO authenticated;
