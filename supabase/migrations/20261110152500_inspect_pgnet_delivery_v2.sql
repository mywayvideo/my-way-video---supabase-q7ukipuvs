-- ==============================================================================
-- Migration: 20261110152500_inspect_pgnet_delivery_v2.sql
--
-- Corrige nomes de colunas: net._http_response e net.http_request_queue mudam
-- de estrutura entre versões do pg_net. Em vez de adivinhar, esta versão lê as
-- colunas reais de information_schema e devolve o conteúdo das linhas como
-- jsonb, sem depender de nome de campo.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.inspect_pgnet_delivery()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cols_resp text;
  v_cols_fila text;
  v_resp jsonb;
  v_fila jsonb;
BEGIN
  -- Colunas reais das duas relações
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO v_cols_resp
  FROM information_schema.columns
  WHERE table_schema = 'net' AND table_name = '_http_response';

  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO v_cols_fila
  FROM information_schema.columns
  WHERE table_schema = 'net' AND table_name = 'http_request_queue';

  -- Conteúdo bruto das respostas recentes, sem presumir nomes de campo
  BEGIN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
             FROM (SELECT * FROM net._http_response LIMIT 40) t'
      INTO v_resp;
  EXCEPTION WHEN OTHERS THEN
    v_resp := jsonb_build_object('erro', SQLERRM);
  END;

  BEGIN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
             FROM (SELECT * FROM net.http_request_queue LIMIT 40) t'
      INTO v_fila;
  EXCEPTION WHEN OTHERS THEN
    v_fila := jsonb_build_object('erro', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'agora', now(),
    'colunas_resposta', v_cols_resp,
    'colunas_fila',     v_cols_fila,
    'respostas',        v_resp,
    'na_fila',          v_fila
  );
END
$function$;

REVOKE ALL ON FUNCTION public.inspect_pgnet_delivery() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspect_pgnet_delivery() TO service_role;
