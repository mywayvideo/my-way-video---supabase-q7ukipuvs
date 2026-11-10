-- ==============================================================================
-- Migration: 20261110154000_evidence_cron_command.sql
--
-- PEÇA DECISIVA: ler o COMANDO REAL de cada job do câmbio (cron.job.command).
--
-- Por que isto importa: as migrations que agendam 'update-exchange-rate-cron'
-- apontam para URLs de PROJETOS DIFERENTES:
--   * 20260414011814 -> https://okpxxlpvqotwijisksui.supabase.co/...
--   * 20260707215600 -> https://ymlkyspcznrrmlktudxx.supabase.co/... (este)
-- Qual delas venceu depende de qual rodou por último. Se o job vivo aponta para
-- o outro projeto, o UPDATE acontece em OUTRO BANCO e o nosso exchange_rate
-- nunca muda — e o cron ainda reporta "succeeded", porque o SELECT funcionou.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.evidence_cron_command()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jobs jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.jobname), '[]'::jsonb)
    INTO v_jobs
  FROM cron.job j
  WHERE j.jobname ILIKE '%exchange%'
     OR j.command ILIKE '%exchange%'
     OR j.command ILIKE '%okpxxlpvqotwijisksui%';

  RETURN jsonb_build_object(
    'agora', now(),
    'projeto_atual', current_database(),
    'jobs', v_jobs
  );
END
$function$;

REVOKE ALL ON FUNCTION public.evidence_cron_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evidence_cron_command() TO service_role;
