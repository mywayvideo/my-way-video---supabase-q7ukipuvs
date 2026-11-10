-- ==============================================================================
-- Migration: 20261110153000_diagnose_exchange_cron.sql
--
-- DIAGNÓSTICO do agendamento do câmbio. Somente leitura.
--
-- Motivo: o alerta de câmbio atrasado disparou duas vezes (09/11 21:45 UTC e
-- 10/11 12:45 UTC) e é preciso distinguir três causas possíveis, que exigem
-- correções diferentes:
--   (a) o job do pg_cron NÃO EXISTE ou está inactive;
--   (b) o job EXISTE e dispara, mas o pg_net entrega a requisição com atraso
--       (fila represada / projeto ocioso) -> é atraso, não falha;
--   (c) o job dispara e a edge devolve erro -> é falha da edge.
--
-- Esta função expõe cron.job, cron.job_run_details e a fila do pg_net, que
-- não são alcançáveis pelo PostgREST.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.diagnose_exchange_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jobs    jsonb;
  v_runs    jsonb;
  v_fila    int;
  v_erro    text;
BEGIN
  -- 1. Os jobs agendados que interessam
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'jobid',    j.jobid,
           'jobname',  j.jobname,
           'schedule', j.schedule,
           'active',   j.active)
         ORDER BY j.jobname), '[]'::jsonb)
    INTO v_jobs
  FROM cron.job j
  WHERE j.jobname ILIKE '%exchange%'
     OR j.jobname ILIKE '%cambio%';

  -- 2. Execuções dos últimos 3 dias
  SELECT coalesce(jsonb_agg(s.x ORDER BY s.ord DESC), '[]'::jsonb)
    INTO v_runs
  FROM (
    SELECT jsonb_build_object(
             'jobname',  j.jobname,
             'status',   d.status,
             'start',    d.start_time,
             'end',      d.end_time,
             'msg',      left(coalesce(d.return_message, ''), 240)
           ) AS x,
           d.start_time AS ord
    FROM cron.job_run_details d
    LEFT JOIN cron.job j ON j.jobid = d.jobid
    WHERE d.start_time > now() - interval '3 days'
    ORDER BY d.start_time DESC
    LIMIT 80
  ) s;

  -- 3. Fila do pg_net (requisições aguardando envio)
  BEGIN
    SELECT count(*) INTO v_fila FROM net.http_request_queue;
  EXCEPTION WHEN OTHERS THEN
    v_fila := NULL;
    v_erro := SQLERRM;
  END;

  RETURN jsonb_build_object(
    'agora',        now(),
    'jobs',         v_jobs,
    'execucoes',    v_runs,
    'fila_pg_net',  v_fila,
    'erro_fila',    v_erro
  );
END
$function$;

COMMENT ON FUNCTION public.diagnose_exchange_cron() IS
  'Somente leitura. Expõe cron.job, cron.job_run_details (3 dias) e o tamanho '
  'da fila do pg_net, para distinguir job ausente de atraso de entrega.';

REVOKE ALL ON FUNCTION public.diagnose_exchange_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diagnose_exchange_cron() TO service_role;
