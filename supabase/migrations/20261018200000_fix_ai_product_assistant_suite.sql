-- ==============================================================================
-- Migration: 20261018200000_fix_ai_product_assistant_suite.sql
-- Descrição:
-- 1. Normalização de token e SKU pontuado na RPC search_products_v2 (BPU70 -> BP-U70, BCQZ1 -> BC-QZ1)
-- 2. Criação da função check_ai_rate_limit(max_requests integer, user_identifier text) no banco
-- 3. Seed / backfill idempotente de product_cache com battery_system para BP-U e NP-FZ100
-- ==============================================================================

-- ==============================================================================
-- (1) ATUALIZAÇÃO DA RPC search_products_v2 COM NORMALIZAÇÃO DE TOKEN
-- ==============================================================================
DROP FUNCTION IF EXISTS public.search_products_v2(text, double precision);
DROP FUNCTION IF EXISTS public.search_products_v2(text, numeric);
DROP FUNCTION IF EXISTS public.search_products_v2(text);

CREATE OR REPLACE FUNCTION public.search_products_v2(
  search_term text,
  boost_multiplier double precision DEFAULT 1.0
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cleaned text;
  v_alphanumeric_q text;
  tokens text[];
BEGIN
  IF search_term IS NULL OR trim(search_term) = '' THEN
    RETURN QUERY SELECT * FROM public.products ORDER BY created_at DESC LIMIT 50;
    RETURN;
  END IF;

  v_cleaned := trim(search_term);
  v_alphanumeric_q := upper(regexp_replace(v_cleaned, '[^a-zA-Z0-9]', '', 'g'));

  SELECT array_agg(t) INTO tokens
  FROM (
    SELECT unnest(string_to_array(regexp_replace(v_cleaned, '\s+', ' ', 'g'), ' ')) AS t
  ) as sub
  WHERE t <> '';

  IF tokens IS NULL THEN
    RETURN QUERY SELECT * FROM public.products ORDER BY created_at DESC LIMIT 50;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.products p
  LEFT JOIN public.manufacturers m ON p.manufacturer_id = m.id
  WHERE 
    -- 1. Match dos tokens individuais (com suporte a remoção de pontuação por token)
    (
      SELECT bool_and(
        concat_ws(' ', p.name, p.description, m.name, p.sku, p.category) ILIKE '%' || token || '%'
        OR (
          length(regexp_replace(token, '[^a-zA-Z0-9]', '', 'g')) >= 3
          AND upper(regexp_replace(concat_ws(' ', p.name, p.sku), '[^a-zA-Z0-9]', '', 'g'))
              LIKE '%' || upper(regexp_replace(token, '[^a-zA-Z0-9]', '', 'g')) || '%'
        )
      )
      FROM unnest(tokens) AS token
    )
    -- 2. Match direto de SKU e Nome
    OR p.sku ILIKE v_cleaned
    OR concat_ws(' ', m.name, p.sku) ILIKE v_cleaned
    OR p.search_vector @@ plainto_tsquery('portuguese', v_cleaned)
    -- 3. Match alfanumérico normalizado sem pontuação (ex: BPU70 -> BP-U70, BCQZ1 -> BC-QZ1)
    OR (
      length(v_alphanumeric_q) >= 3
      AND (
        public.normalize_sku_key(p.sku) = v_alphanumeric_q
        OR public.normalize_sku_key(p.sku) LIKE '%' || v_alphanumeric_q || '%'
        OR upper(regexp_replace(p.name, '[^a-zA-Z0-9]', '', 'g')) LIKE '%' || v_alphanumeric_q || '%'
      )
    )
  ORDER BY 
    CASE WHEN p.sku ILIKE v_cleaned THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.sku) ILIKE v_cleaned THEN 0 ELSE 1 END,
    CASE WHEN length(v_alphanumeric_q) >= 3 AND public.normalize_sku_key(p.sku) = v_alphanumeric_q THEN 0 ELSE 1 END,
    CASE WHEN p.name ILIKE v_cleaned THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE v_cleaned THEN 0 ELSE 1 END,
    CASE WHEN p.name ILIKE v_cleaned || '%' THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE v_cleaned || '%' THEN 0 ELSE 1 END,
    CASE WHEN p.sku ILIKE v_cleaned || '%' THEN 0 ELSE 1 END,
    CASE WHEN p.name ILIKE '%' || v_cleaned || '%' THEN 0 ELSE 1 END,
    CASE WHEN concat_ws(' ', m.name, p.name) ILIKE '%' || v_cleaned || '%' THEN 0 ELSE 1 END,
    ts_rank(p.search_vector, plainto_tsquery('portuguese', v_cleaned)) DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_products_v2(text, double precision) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.search_products_v2(text, double precision) IS
'Busca de produtos com relevância, matching de tokens e normalização alfanumérica de SKU/Nome para equiparar termos com e sem hífen (ex: BPU70 = BP-U70).';


-- ==============================================================================
-- (2) CRIAÇÃO DA TABELA E FUNÇÃO check_ai_rate_limit
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  id SERIAL PRIMARY KEY,
  identifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_identifier_created
  ON public.ai_rate_limits (identifier, created_at DESC);

-- Habilita RLS
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin Full Access" ON public.ai_rate_limits;
CREATE POLICY "Admin Full Access" ON public.ai_rate_limits
  FOR ALL TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Permitir acesso total para o projeto" ON public.ai_rate_limits;
CREATE POLICY "Permitir acesso total para o projeto" ON public.ai_rate_limits
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "ai_rate_limits_service_role" ON public.ai_rate_limits;
CREATE POLICY "ai_rate_limits_service_role" ON public.ai_rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Função RPC check_ai_rate_limit chamada pela edge function:
-- supabase.rpc('check_ai_rate_limit', { user_identifier: identifier, max_requests: limit })
-- Retorna BOOLEAN: true = permitido, false = limite atingido
CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
  user_identifier text,
  max_requests integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window_start timestamptz;
  v_current_count integer;
  v_clean_identifier text;
  v_max_req integer;
BEGIN
  v_clean_identifier := trim(COALESCE(user_identifier, 'unknown'));
  v_max_req := GREATEST(COALESCE(max_requests, 20), 1);
  v_window_start := now() - interval '1 minute';

  -- Conta requisições na última janela de 1 minuto
  SELECT count(*) INTO v_current_count
  FROM public.ai_rate_limits
  WHERE identifier = v_clean_identifier
    AND created_at >= v_window_start;

  IF v_current_count >= v_max_req THEN
    RETURN false;
  END IF;

  -- Registra a nova requisição
  INSERT INTO public.ai_rate_limits (identifier, created_at)
  VALUES (v_clean_identifier, now());

  -- Limpeza oportunista (probabilidade de 5% por request para manter tabela leve)
  IF random() < 0.05 THEN
    DELETE FROM public.ai_rate_limits
    WHERE created_at < (now() - interval '1 hour');
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(text, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.check_ai_rate_limit(text, integer) IS
'Verifica e registra rate limit para chamadas de IA por identifier (IP ou sessão) com janela de 1 minuto.';


-- ==============================================================================
-- (3) PREENCHIMENTO DE product_cache COM battery_system (SEED IDEMPOTENTE)
-- ==============================================================================
-- Garante constraint UNIQUE necessária para UPSERT idempotente em product_cache
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'product_cache' AND indexname = 'uq_product_cache_product_spec'
  ) THEN
    -- Remove eventuais duplicatas existentes antes de criar o índice único
    DELETE FROM public.product_cache a USING public.product_cache b
    WHERE a.ctid < b.ctid
      AND a.product_id = b.product_id
      AND a.spec_key = b.spec_key;

    CREATE UNIQUE INDEX uq_product_cache_product_spec
      ON public.product_cache (product_id, spec_key);
  END IF;
END $$;

-- Inserção idempotente das especificações técnicas de sistema de bateria
DO $$
DECLARE
  r RECORD;
  v_battery_system text;
BEGIN
  -- 1. Baterias BP-U
  FOR r IN (
    SELECT id, sku, name FROM public.products
    WHERE sku IN ('BPU35', 'BPU60T', 'BPU70', 'BPU100')
       OR name ILIKE '%BP-U35%'
       OR name ILIKE '%BP-U60%'
       OR name ILIKE '%BP-U70%'
       OR name ILIKE '%BPU100%'
  ) LOOP
    INSERT INTO public.product_cache (
      id, product_id, spec_key, spec_value, source, confidence, cached_at, expires_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      r.id,
      'battery_system',
      'BP-U',
      'manual_seed_compatibility',
      1.0,
      now(),
      now() + interval '3650 days',
      now(),
      now()
    )
    ON CONFLICT (product_id, spec_key)
    DO UPDATE SET
      spec_value = EXCLUDED.spec_value,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      expires_at = EXCLUDED.expires_at,
      updated_at = now();
  END LOOP;

  -- 2. Carregadores BP-U (BC-U1A, BC-U2A, etc.)
  FOR r IN (
    SELECT id, sku, name FROM public.products
    WHERE sku IN ('BCU1A', 'BCU2A')
       OR name ILIKE '%BC-U1A%'
       OR name ILIKE '%BC-U2A%'
       OR name ILIKE '%BCU2A%'
  ) LOOP
    INSERT INTO public.product_cache (
      id, product_id, spec_key, spec_value, source, confidence, cached_at, expires_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      r.id,
      'battery_system',
      'BP-U',
      'manual_seed_compatibility',
      1.0,
      now(),
      now() + interval '3650 days',
      now(),
      now()
    )
    ON CONFLICT (product_id, spec_key)
    DO UPDATE SET
      spec_value = EXCLUDED.spec_value,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      expires_at = EXCLUDED.expires_at,
      updated_at = now();
  END LOOP;

  -- 3. Câmera Sony PXW-Z200 (usa sistema de baterias BP-U: BP-U35, BP-U70, BP-U100)
  FOR r IN (
    SELECT id, sku, name FROM public.products
    WHERE id = '2af51558-98ae-4183-8596-0f3d158c3e3c'::uuid
       OR sku = 'PXWZ200'
  ) LOOP
    INSERT INTO public.product_cache (
      id, product_id, spec_key, spec_value, source, confidence, cached_at, expires_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      r.id,
      'battery_system',
      'BP-U',
      'manual_seed_compatibility',
      1.0,
      now(),
      now() + interval '3650 days',
      now(),
      now()
    )
    ON CONFLICT (product_id, spec_key)
    DO UPDATE SET
      spec_value = EXCLUDED.spec_value,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      expires_at = EXCLUDED.expires_at,
      updated_at = now();
  END LOOP;

  -- 4. Bateria e carregador Sony NP-FZ100 (BC-QZ1 carrega NP-FZ100, NÃO BP-U)
  FOR r IN (
    SELECT id, sku, name FROM public.products
    WHERE sku IN ('BCQZ1', 'NPFZ100')
       OR name ILIKE '%BC-QZ1%'
       OR name ILIKE '%NP-FZ100%'
  ) LOOP
    INSERT INTO public.product_cache (
      id, product_id, spec_key, spec_value, source, confidence, cached_at, expires_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      r.id,
      'battery_system',
      'NP-FZ100',
      'manual_seed_compatibility',
      1.0,
      now(),
      now() + interval '3650 days',
      now(),
      now()
    )
    ON CONFLICT (product_id, spec_key)
    DO UPDATE SET
      spec_value = EXCLUDED.spec_value,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      expires_at = EXCLUDED.expires_at,
      updated_at = now();
  END LOOP;
END $$;

-- 4. Recarrega cache do PostgREST
NOTIFY pgrst, 'reload schema';
