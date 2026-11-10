-- ==============================================================================
-- Migration: 20261110153000_evidence_exchange_latency.sql
--
-- EVIDÊNCIA para o report ao Skip — mede a DEFASAGEM entre o disparo do cron e
-- a execução real da edge function.
--
-- Raciocínio:
--   * cron.job_run_details.start_time  = quando o SQL do job rodou (net.http_post)
--   * net._http_response.created       = quando a requisição foi efetivamente
--                                        enviada e a resposta voltou
--   * cron.job_run_details devolve "succeeded" em milissegundos porque só executa
--     o SELECT; a entrega HTTP é assíncrona, feita pelo worker do pg_net.
--
-- Se houver respostas com content ~ 'usd_to_brl' e created muito depois de
-- :15, a causa é ATRASO DE ENTREGA DO pg_net, não falha do job.
--
-- Também devolve a lista de todos os horários em que a edge respondeu, para
-- correlacionar com os slots agendados.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.evidence_exchange_latency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resp jsonb;
  v_runs jsonb;
  v_total_resp int;
  v_total_fx   int;
BEGIN
  -- TODO o conteúdo de _http_response existente (a tabela é pequena)
  SELECT count(*) INTO v_total_resp FROM net._http_response;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'created', r.created,
           'status',  r.status_code,
           'content', left(r.content, 160),
           'erro',    r.error_msg,
           'timeout', r.timed_out
         ) ORDER BY r.created DESC), '[]'::jsonb)
    INTO v_resp
  FROM net._http_response r
  WHERE r.content ILIKE '%usd_to_brl%'
     OR r.content ILIKE '%update-exchange-rate%'
     OR r.content ILIKE '%"rate"%';

  SELECT count(*) INTO v_total_fx
  FROM net._http_response r
  WHERE r.content ILIKE '%usd_to_brl%' OR r.content ILIKE '%"rate"%';

  -- Disparos do job do câmbio (últimos 4 dias)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'start', d.start_time,
           'end',   d.end_time,
           'status', d.status,
           'msg',   left(coalesce(d.return_message,''), 120)
         ) ORDER BY d.start_time DESC), '[]'::jsonb)
    INTO v_runs
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname = 'update-exchange-rate-cron'
    AND d.start_time > now() - interval '4 days';

  RETURN jsonb_build_object(
    'agora', now(),
    'total_respostas_na_tabela', v_total_resp,
    'total_respostas_cambio',    v_total_fx,
    'respostas_cambio',          v_resp,
    'disparos_cron',             v_runs,
    'ultima_taxa', (SELECT max(last_updated) FROM public.exchange_rate)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.evidence_exchange_latency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evidence_exchange_latency() TO service_role;
