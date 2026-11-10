-- ==============================================================================
-- Migration: 20261110152000_inspect_pgnet_delivery.sql
--
-- EVIDÊNCIA FINAL para o report ao Skip.
--
-- Hipótese a testar: o job do pg_cron dispara e retorna "succeeded" em poucos
-- milissegundos, mas isso só prova que o SQL `SELECT net.http_post(...)` rodou —
-- NÃO que a requisição HTTP foi entregue. A entrega depende do worker do pg_net.
--
-- Se a diferença entre o horário agendado e o horário em que a resposta chegou
-- (net._http_response.created) for de dezenas de minutos, a causa está na
-- ENTREGA do pg_net, não no agendamento.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.inspect_pgnet_delivery()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resp jsonb;
  v_req  jsonb;
BEGIN
  -- Respostas recebidas nas últimas 48h (mostra quando a edge respondeu)
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id',         r.id,
             'status',     r.status_code,
             'criado',     r.created,
             'url',        left(r.url, 90)
           ) ORDER BY r.created DESC), '[]'::jsonb)
      INTO v_resp
    FROM (
      SELECT * FROM net._http_response
      WHERE created > now() - interval '48 hours'
      ORDER BY created DESC
      LIMIT 40
    ) r;
  EXCEPTION WHEN OTHERS THEN
    v_resp := jsonb_build_object('erro', SQLERRM);
  END;

  -- Requisições ainda na fila
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', q.id, 'criado', q.created, 'url', left(q.url, 90)
           ) ORDER BY q.created DESC), '[]'::jsonb)
      INTO v_req
    FROM net.http_request_queue q
    WHERE q.created > now() - interval '48 hours';
  EXCEPTION WHEN OTHERS THEN
    v_req := jsonb_build_object('erro', SQLERRM);
  END;

  RETURN jsonb_build_object('respostas', v_resp, 'na_fila', v_req, 'agora', now());
END
$function$;

REVOKE ALL ON FUNCTION public.inspect_pgnet_delivery() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspect_pgnet_delivery() TO service_role;
