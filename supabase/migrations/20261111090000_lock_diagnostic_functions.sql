-- ==============================================================================
-- Migration: 20261111090000_lock_diagnostic_functions.sql
--
-- CORREÇÃO DE SEGURANÇA — falha minha.
--
-- Eu criei as funções de diagnóstico (diagnose_exchange_cron,
-- inspect_pgnet_delivery, evidence_exchange_latency, evidence_slot_window,
-- evidence_cron_command, verify_exchange_cron_fix, where_is_the_service_key)
-- com:
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION ... TO service_role;
--
-- Mesmo assim, o token de um usuário comum com papel admin (via chave anon)
-- executou where_is_the_service_key() com sucesso e leu o NOME do segredo do
-- vault. Causa: o REVOKE de PUBLIC não bastou, porque `anon` e `authenticated`
-- recebem EXECUTE por grants padrão do schema public.
--
-- Risco real: inspect_pgnet_delivery() devolve o CORPO das respostas HTTP do
-- pg_net, que podem conter tokens. evidence_cron_command() devolve o comando
-- inteiro dos jobs. Não podem estar expostas a usuário de aplicação.
--
-- Correção: REVOKE explícito de anon e authenticated em todas.
-- ==============================================================================

DO $lock$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.diagnose_exchange_cron()',
    'public.inspect_pgnet_delivery()',
    'public.evidence_exchange_latency()',
    'public.evidence_slot_window()',
    'public.evidence_cron_command()',
    'public.verify_exchange_cron_fix()',
    'public.where_is_the_service_key()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
      RAISE NOTICE 'travada: %', fn;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'falhou em %: %', fn, SQLERRM;
    END;
  END LOOP;
END
$lock$;
