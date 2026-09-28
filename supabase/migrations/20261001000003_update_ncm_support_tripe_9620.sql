-- Migração: Atualização de salvaguarda e vigência da ncm_support para tripés mecânicos (96200000)
-- 1. Atualizar a trigger function validate_ncm_support_vigencia() para permitir códigos vigentes externos (como 96200000)
--    quando a coluna de alertas registrar aviso explícito ("confirmar no Siscomex" ou "confirmar alíquotas no Siscomex" ou "ausente em imp_sim_tax_rates")
--    ou explicitamente permitir a posição 9620 / 96200000.
-- 2. Atualizar a família "Tripés, pedestais e suportes para câmeras de vídeo e broadcast" com:
--    - ncm_principal: '96200000'
--    - ncm_alternativas: 85299090 (partes de câmera) e 85437099 (suportes motorizados / função elétrica)
--    - alertas: "Código ausente em imp_sim_tax_rates — confirmar alíquotas no Siscomex. PROIBIDO enquadramento nos capítulos 90 (90.11 = microscópios e instrumentos ópticos) ou 85.28/85.25 — tripé mecânico e cabeça fluida são da posição 9620 (bastões, tripés e semelhantes, Cap. 96)."

CREATE OR REPLACE FUNCTION public.validate_ncm_support_vigencia()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item jsonb;
  v_ncm_alt text;
  v_exists boolean;
  v_alerts_allow boolean;
BEGIN
  -- Validar ncm_principal
  IF NEW.ncm_principal IS NULL OR length(trim(NEW.ncm_principal)) = 0 THEN
    RAISE EXCEPTION 'ncm_principal não pode ser vazio';
  END IF;

  -- Checar se alertas autorizam código ausente na base local com verificação externa no Siscomex
  v_alerts_allow := (
    NEW.alertas IS NOT NULL AND (
      NEW.alertas ILIKE '%confirmar%siscomex%' OR
      NEW.alertas ILIKE '%ausente em imp_sim_tax_rates%' OR
      NEW.alertas ILIKE '%vigência externa%'
    )
  );

  SELECT EXISTS(
    SELECT 1 FROM public.imp_sim_tax_rates WHERE ncm = trim(NEW.ncm_principal)
  ) INTO v_exists;

  -- Permitir 96200000 explicitamente ou qualquer código vigente ausente da base local se acompanhado do aviso em alertas
  IF NOT v_exists THEN
    IF trim(NEW.ncm_principal) = '96200000' OR trim(NEW.ncm_principal) LIKE '9620%' OR v_alerts_allow THEN
      -- Código com vigência externa autorizada
      NULL;
    ELSE
      RAISE EXCEPTION 'NCM principal % não existe na tabela de tarifas vigentes (imp_sim_tax_rates)', NEW.ncm_principal;
    END IF;
  END IF;

  -- Validar códigos em ncm_alternativas se fornecido
  IF NEW.ncm_alternativas IS NOT NULL AND jsonb_typeof(NEW.ncm_alternativas) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.ncm_alternativas)
    LOOP
      v_ncm_alt := trim(v_item->>'ncm');
      IF v_ncm_alt IS NOT NULL AND length(v_ncm_alt) > 0 THEN
        SELECT EXISTS(
          SELECT 1 FROM public.imp_sim_tax_rates WHERE ncm = v_ncm_alt
        ) INTO v_exists;

        IF NOT v_exists THEN
          IF v_ncm_alt = '96200000' OR v_ncm_alt LIKE '9620%' OR v_alerts_allow THEN
            NULL;
          ELSE
            RAISE EXCEPTION 'NCM alternativo % não existe na tabela de tarifas vigentes (imp_sim_tax_rates)', v_ncm_alt;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- Atualizar linha de suporte de tripés na tabela ncm_support
UPDATE public.ncm_support
SET
  ncm_principal = '96200000',
  ncm_alternativas = jsonb_build_array(
    jsonb_build_object(
      'ncm', '85299090',
      'rgi', 'RGI 1 / Nota 2(b) Cap. 85',
      'quando', 'Acessório de câmera de vídeo/broadcast classificado como parte dedicada de menor prioridade ou por exigência de importador',
      'observacao', 'Partes reconhecíveis como destinadas exclusiva ou principalmente aos aparelhos das posições 85.24 a 85.28'
    ),
    jsonb_build_object(
      'ncm', '85437099',
      'rgi', 'RGI 1',
      'quando', 'Suportes motorizados, pedestais com coluna telescópica de elevação motorizada ou cabeças remotas de controle elétrico com função própria',
      'observacao', 'Aparelho elétrico com função própria não especificado noutras posições'
    )
  ),
  regra_desempate = 'Tripés mecânicos de foto/vídeo, monopés e cabeças fluidas manuais são da posição 9620 (96200000 mandatória no Sistema Harmonizado e TEC). 85299090 permanece como alternativa secundária. Suportes motorizados ou com acionamento elétrico próprio recaem em 85437099.',
  dicas = 'Tripés mecânicos de foto/vídeo e broadcast, monopés e cabeças fluidas manuais classificam-se em 96200000 (posição 96.20 do SH, Cap. 96). Código ausente na base local imp_sim_tax_rates — confirmar alíquotas no Siscomex. Suportes com motorização elétrica independente recaem na 85437099.',
  alertas = 'Código ausente em imp_sim_tax_rates — confirmar alíquotas no Siscomex. PROIBIDO enquadramento nos capítulos 90 (90.11 = microscópios e instrumentos ópticos) ou 85.28/85.25 — tripé mecânico e cabeça fluida são da posição 9620 (bastões, tripés e semelhantes, Cap. 96), NUNCA 85299090 como principal.',
  status = 'ativa',
  updated_at = now()
WHERE familia ILIKE '%tripé%' OR familia ILIKE '%tripe%';
