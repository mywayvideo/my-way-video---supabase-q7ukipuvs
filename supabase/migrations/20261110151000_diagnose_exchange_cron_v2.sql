-- ==============================================================================
-- Migration: 20261110151000_diagnose_exchange_cron_v2.sql
--
-- Ajuste: filtrar as execuções POR JOBNAME no SQL. A versão anterior devolvia as
-- 80 execuções mais recentes de qualquer job e, como os crons do NCM
-- (drain-ncm-embeddings-cron / drain-ncm-chapter90-cron) rodam a cada ~1 minuto,
-- elas ocupavam todas as 80 linhas e as do câmbio nunca apareciam.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.diagnose_exchange_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jobs  jsonb;
  v_runs  jsonb;
  v_fila  int;
  v_erro  text;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'jobid', j.jobid, 'jobname', j.jobname,
           'schedule', j.schedule, 'active', j.active) ORDER BY j.jobname), '[]'::jsonb)
    INTO v_jobs
  FROM cron.job j
  WHERE j.jobname IN ('update-exchange-rate-cron', 'check-exchange-rate-staleness');

  -- Só as execuções dos DOIS jobs do câmbio, filtradas no SQL
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'jobname', j.jobname,
           'status',  d.status,
           'start',   d.start_time,
           'end',     d.end_time,
           'msg',     left(coalesce(d.return_message, ''), 300)
         ) ORDER BY d.start_time DESC), '[]'::jsonb)
    INTO v_runs
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname IN ('update-exchange-rate-cron', 'check-exchange-rate-staleness')
    AND d.start_time > now() - interval '4 days';

  BEGIN
    SELECT count(*) INTO v_fila FROM net.http_request_queue;
  EXCEPTION WHEN OTHERS THEN
    v_fila := NULL; v_erro := SQLERRM;
  END;

  RETURN jsonb_build_object(
    'agora', now(), 'jobs', v_jobs, 'execucoes', v_runs,
    'fila_pg_net', v_fila, 'erro_fila', v_erro,
    'ultima_taxa', (SELECT max(last_updated) FROM public.exchange_rate)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.diagnose_exchange_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diagnose_exchange_cron() TO service_role;
