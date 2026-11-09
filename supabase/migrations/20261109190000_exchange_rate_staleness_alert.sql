-- ==============================================================================
-- Migration: 20261109190000_exchange_rate_staleness_alert.sql
--
-- Alerta de câmbio atrasado DENTRO DO BANCO, sem depender de canal externo.
--
-- SOLICITADO PELO PROPRIETÁRIO (Patrick Lynch) em 09/11/2026:
--   "Criar alerta quando o câmbio atrasar em dia útil"
--
-- CORREÇÃO DA PREMISSA (importante): o alerta pedido dizia "em dia útil", mas
-- verificamos que essa premissa está errada. O pg_cron roda
--     '15 12,15,18,21 * * *'   (UTC)  =  09:15, 12:15, 15:15 e 18:15 BRT
-- TODOS OS DIAS, inclusive sábado, domingo e feriado. Portanto o critério
-- correto NÃO é "dias úteis": é comparar a última gravação com o último slot
-- de agendamento que já venceu. Alerta por "dia útil" produziria silêncio
-- justamente nos fins de semana em que o job falha — que foi o caso de 07/11.
--
-- COMO FUNCIONA:
--   1. A edge update-exchange-rate SEMPRE grava last_updated = now(), mesmo
--      quando a cotação não muda de valor. Logo, timestamp antigo = job não
--      executou. Não é necessário ler cron.job_run_details.
--   2. Uma função compara a última gravação com o último slot vencido,
--      descontando uma tolerância de 25 min (pg_net despacha em background).
--   3. Um job pg_cron roda 30 min depois de cada slot e, se estiver atrasado,
--      registra o alerta em public.system_alerts.
--
-- POR QUE UMA TABELA DE ALERTAS:
--   O cron do banco não consegue "mandar mensagem" para um humano. Mas ele
--   consegue gravar uma linha. Assim o aviso existe mesmo se o assistente
--   estiver dormindo, e o histórico fica auditável (quando começou, quando
--   voltou ao normal).
--
-- Idempotente.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Tabela de alertas do sistema (genérica, serve para outros alertas depois)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,              -- identificador do alerta (ex.: 'exchange_rate_stale')
  severity    text NOT NULL DEFAULT 'warning',
  title       text NOT NULL,
  detail      text,
  is_open     boolean NOT NULL DEFAULT true,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Um alerta aberto por chave: não empilha 4 avisos por dia
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_alerts_open_key
  ON public.system_alerts (key) WHERE is_open;

CREATE INDEX IF NOT EXISTS idx_system_alerts_open
  ON public.system_alerts (is_open, opened_at DESC);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_alerts_select_staff" ON public.system_alerts;
CREATE POLICY "system_alerts_select_staff" ON public.system_alerts
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- Escrita apenas por gatilho/função SECURITY DEFINER; nada de INSERT pelo app.

-- ------------------------------------------------------------------------------
-- 2. Função de verificação
--    Slots do cron em UTC: 12:15, 15:15, 18:15, 21:15
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_exchange_rate_staleness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ultima      timestamptz;
  v_slot        timestamptz;
  v_agora       timestamptz := now();
  v_hora_utc    numeric;
  v_tolerancia  interval := interval '25 minutes';
  v_atrasado    boolean;
  v_horas       numeric;
  v_detalhe     text;
BEGIN
  SELECT max(last_updated) INTO v_ultima FROM public.exchange_rate;

  -- Quantas horas são agora em UTC (para achar o slot mais recente)
  v_hora_utc := extract(hour FROM (v_agora AT TIME ZONE 'UTC'))
                + extract(minute FROM (v_agora AT TIME ZONE 'UTC')) / 60.0;

  -- Último slot do cron que já venceu (12:15, 15:15, 18:15, 21:15 UTC).
  -- Se ainda não passou de 12:15 hoje, o slot é o das 21:15 de ontem.
  IF v_hora_utc >= 21.25 THEN
    v_slot := date_trunc('day', v_agora AT TIME ZONE 'UTC') + interval '21 hours 15 minutes';
  ELSIF v_hora_utc >= 18.25 THEN
    v_slot := date_trunc('day', v_agora AT TIME ZONE 'UTC') + interval '18 hours 15 minutes';
  ELSIF v_hora_utc >= 15.25 THEN
    v_slot := date_trunc('day', v_agora AT TIME ZONE 'UTC') + interval '15 hours 15 minutes';
  ELSIF v_hora_utc >= 12.25 THEN
    v_slot := date_trunc('day', v_agora AT TIME ZONE 'UTC') + interval '12 hours 15 minutes';
  ELSE
    v_slot := date_trunc('day', v_agora AT TIME ZONE 'UTC') + interval '21 hours 15 minutes'
              - interval '1 day';
  END IF;

  v_slot := v_slot AT TIME ZONE 'UTC';

  -- Cedo demais para julgar: ainda dentro da tolerância do slot
  IF v_agora < v_slot + v_tolerancia THEN
    v_atrasado := false;
    v_detalhe  := 'aguardando a execução do slot (dentro da tolerância)';
  ELSIF v_ultima IS NULL THEN
    v_atrasado := true;
    v_detalhe  := 'nenhuma taxa de câmbio registrada';
  ELSIF v_ultima < v_slot THEN
    v_atrasado := true;
    v_horas    := round(extract(epoch FROM (v_agora - v_ultima)) / 3600, 1);
    v_detalhe  := format('%s h sem atualização (slot esperado: %s UTC)',
                         v_horas, to_char(v_slot, 'DD/MM HH24:MI'));
  ELSE
    v_atrasado := false;
    v_detalhe  := 'em dia';
  END IF;

  -- Abre o alerta se atrasado e ainda não houver um aberto
  IF v_atrasado THEN
    INSERT INTO public.system_alerts (key, severity, title, detail)
    VALUES ('exchange_rate_stale', 'warning',
            'Câmbio sem atualização', v_detalhe)
    ON CONFLICT (key) WHERE is_open DO NOTHING;
  ELSE
    -- Fecha o alerta se voltou ao normal
    UPDATE public.system_alerts
       SET is_open = false, resolved_at = now()
     WHERE key = 'exchange_rate_stale' AND is_open
       AND v_detalhe = 'em dia';
  END IF;

  RETURN jsonb_build_object(
    'atrasado',   v_atrasado,
    'ultima',     v_ultima,
    'slot',       v_slot,
    'detalhe',    v_detalhe,
    'verificado', v_agora
  );
END
$function$;

COMMENT ON FUNCTION public.check_exchange_rate_staleness() IS
  'Compara a última gravação de exchange_rate com o último slot vencido do '
  'pg_cron (12:15/15:15/18:15/21:15 UTC, todos os dias) e registra alerta em '
  'system_alerts quando atrasado. Critério por slot, NÃO por dia útil: o cron '
  'roda inclusive fim de semana.';

-- ------------------------------------------------------------------------------
-- 3. Agendamento: 30 min depois de cada slot (12:45, 15:45, 18:45, 21:45 UTC)
--    = 09:45, 12:45, 15:45, 18:45 BRT
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-exchange-rate-staleness') THEN
    PERFORM cron.unschedule('check-exchange-rate-staleness');
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'check-exchange-rate-staleness',
    '45 12,15,18,21 * * *',
    'SELECT public.check_exchange_rate_staleness()'
  );
END $$;

NOTIFY pgrst, 'reload schema';
