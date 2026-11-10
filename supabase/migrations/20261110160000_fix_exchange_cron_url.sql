-- ==============================================================================
-- Migration: 20261110160000_fix_exchange_cron_url.sql
--
-- CORRIGE a causa raiz do câmbio parado.
--
-- PROBLEMA PROVADO (10/11/2026): o job 'update-exchange-rate-cron' executa
--     SELECT net.http_post(
--       url := 'https://okpxxlpvqotwijisksui.supabase.co/functions/v1/update-exchange-rate', ...)
-- mas este projeto é ymlkyspcznrrmlktudxx. A requisição vai para OUTRO projeto:
-- responde 200 e atualiza a taxa LÁ, enquanto exchange_rate aqui nunca muda.
-- O job reporta "succeeded" porque só o SELECT é medido — a entrega é assíncrona.
--
-- Por que a migration 20260707215600 (que já usava a URL correta) não resolveu
-- é desconhecido e NÃO foi provado. Esta versão torna a correção verificável:
--   1. remove TODOS os jobs cujo comando menciona a URL antiga (qualquer nome);
--   2. agenda de novo com a URL deste projeto;
--   3. devolve jsonb dizendo quantos removeu e o comando final, para conferência.
--
-- Idempotente: pode rodar quantas vezes for preciso.
-- ==============================================================================

DO $fix$
DECLARE
  v_removidos int := 0;
  r record;
BEGIN
  -- 1. Remover qualquer job que ainda aponte para o projeto antigo.
  --    Não confiamos no nome do job: olhamos o COMANDO.
  FOR r IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE command ILIKE '%okpxxlpvqotwijisksui%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
    RAISE NOTICE 'Job removido (URL antiga): % [jobid %]', r.jobname, r.jobid;
    v_removidos := v_removidos + 1;
  END LOOP;

  -- 2. Se sobrou um job com o mesmo nome (agendando outra coisa), remover também
  --    para não ficar duplicado.
  FOR r IN
    SELECT jobid, jobname FROM cron.job
    WHERE jobname = 'update-exchange-rate-cron'
  LOOP
    PERFORM cron.unschedule(r.jobid);
    RAISE NOTICE 'Job duplicado removido: % [jobid %]', r.jobname, r.jobid;
    v_removidos := v_removidos + 1;
  END LOOP;

  RAISE NOTICE 'Total de jobs removidos: %', v_removidos;
END
$fix$;

-- 3. Reagendar apontando para ESTE projeto, sem depender de segredo no SQL:
--    a função trigger_exchange_rate_update() lê a credencial de app_settings/vault
--    e já monta o header Authorization. Ela é a forma correta de disparar.
DO $sched$
BEGIN
  PERFORM cron.schedule(
    'update-exchange-rate-cron',
    '15 12,15,18,21 * * *',
    'SELECT public.trigger_exchange_rate_update();'
  );
END
$sched$;

-- 4. Conferência: devolve o comando final gravado, para leitura imediata.
CREATE OR REPLACE FUNCTION public.verify_exchange_cron_fix()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'jobid',    j.jobid,
           'jobname',  j.jobname,
           'schedule', j.schedule,
           'active',   j.active,
           'aponta_para_projeto_errado', (j.command ILIKE '%okpxxlpvqotwijisksui%'),
           'command',  j.command
         ) ORDER BY j.jobname), '[]'::jsonb)
    INTO v
  FROM cron.job j
  WHERE j.jobname = 'update-exchange-rate-cron'
     OR j.command ILIKE '%exchange-rate%';

  RETURN jsonb_build_object('agora', now(), 'jobs', v);
END
$function$;

REVOKE ALL ON FUNCTION public.verify_exchange_cron_fix() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_exchange_cron_fix() TO service_role;
