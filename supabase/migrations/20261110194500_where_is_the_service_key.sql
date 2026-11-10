-- ==============================================================================
-- Migration: 20261110194500_where_is_the_service_key.sql
--
-- SOMENTE LEITURA. Onde está a credencial que trigger_exchange_rate_update() usa?
--
-- Contexto: app_settings NÃO contém 'SUPABASE_SERVICE_ROLE_KEY' (0 de 24 chaves,
-- verificado em 10/11). Mesmo assim o trigger funcionou e atualizou a taxa em
-- 6 segundos. Logo a chave vem de vault.decrypted_secrets.
--
-- Por que isto importa: a função faz
--     IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
--       RAISE NOTICE '...'; RETURN;
--     END IF;
-- Um RETURN silencioso não aparece em cron.job_run_details (o job reporta
-- "succeeded", como já aconteceu antes). É a MESMA classe de falha silenciosa
-- que acabamos de corrigir. Vale saber de onde a chave vem para monitorar.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.where_is_the_service_key()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app_settings boolean := false;
  v_vault_nomes  jsonb;
  v_vault_erro   text;
BEGIN
  -- 1. Está em app_settings?
  SELECT EXISTS (
    SELECT 1 FROM public.app_settings
    WHERE setting_key = 'SUPABASE_SERVICE_ROLE_KEY'
      AND setting_value IS NOT NULL
      AND setting_value <> ''
  ) INTO v_app_settings;

  -- 2. Está em vault? (revela apenas o NOME do segredo, nunca o valor)
  BEGIN
    SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb)
      INTO v_vault_nomes
    FROM vault.decrypted_secrets
    WHERE name ILIKE '%SERVICE_ROLE%'
       OR name ILIKE '%SUPABASE%';
  EXCEPTION WHEN OTHERS THEN
    v_vault_erro := SQLERRM;
    v_vault_nomes := NULL;
  END;

  RETURN jsonb_build_object(
    'em_app_settings',      v_app_settings,
    'segredos_no_vault',    v_vault_nomes,
    'erro_ao_ler_vault',    v_vault_erro,
    'leitura_em',           now()
  );
END
$function$;

REVOKE ALL ON FUNCTION public.where_is_the_service_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.where_is_the_service_key() TO service_role;
