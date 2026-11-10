-- ==============================================================================
-- Migration: 20261110153500_evidence_slot_window.sql
--
-- Prova decisiva dentro da janela de retenção do pg_net (~5h, pois os crons do
-- NCM gravam uma resposta por minuto e a tabela tem ~306 linhas).
--
-- Compara, para a JANELA do slot das 12:15 UTC de hoje (a única ainda retida):
--   * o disparo do job (cron.job_run_details)
--   * as requisições em fila / respostas (net.*)
--
-- e devolve TODAS as respostas daquela janela, sem filtro de conteúdo, para não
-- perder a resposta real do update-exchange-rate por causa do formato.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.evidence_slot_window()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resp jsonb;
  v_runs jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'created', r.created, 'status', r.status_code,
           'content', left(r.content, 300), 'erro', r.error_msg,
           'timeout', r.timed_out, 'id', r.id
         ) ORDER BY r.created), '[]'::jsonb)
    INTO v_resp
  FROM net._http_response r
  WHERE r.created >= '2026-11-10T12:13:00+00'::timestamptz
    AND r.created <= '2026-11-10T12:25:00+00'::timestamptz;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'jobname', j.jobname, 'start', d.start_time,
           'end', d.end_time, 'status', d.status,
           'msg', left(coalesce(d.return_message,''), 120)
         ) ORDER BY d.start_time), '[]'::jsonb)
    INTO v_runs
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.start_time >= '2026-11-10T12:13:00+00'::timestamptz
    AND d.start_time <= '2026-11-10T12:25:00+00'::timestamptz
    AND j.jobname IN ('update-exchange-rate-cron','check-exchange-rate-staleness');

  RETURN jsonb_build_object(
    'janela', '2026-11-10 12:13 a 12:25 UTC',
    'job_do_cambio', v_runs,
    'respostas_pgnet', v_resp,
    'agora', now()
  );
END
$function$;

REVOKE ALL ON FUNCTION public.evidence_slot_window() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evidence_slot_window() TO service_role;
