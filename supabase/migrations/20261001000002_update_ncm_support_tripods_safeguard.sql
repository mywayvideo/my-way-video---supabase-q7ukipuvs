-- Atualização da família "Tripés, pedestais e suportes para câmeras de vídeo e broadcast" na tabela ncm_support
-- Regra 2.1 e 2.2: Alertas reforçados proibindo enquadramento nos capítulos 90 (90.11 etc) e 85.28/85.25 para suportes mecânicos,
-- e diretriz clara de sustentação para 9620 (ausente na base) com aviso Siscomex ou 85299090 (Nota 2b Cap. 85).

DO $$
BEGIN
  -- A trigger validate_ncm_support_vigencia valida códigos existentes em imp_sim_tax_rates.
  -- Como o código 9620 está ausente de imp_sim_tax_rates (posição internacional 96.20 não cadastrada),
  -- a intenção e instrução completa de uso do 9620 com aviso Siscomex é registrada no campo 'alertas' e 'dicas',
  -- mantendo ncm_alternativas compatível com a integridade referencial da trigger.
  UPDATE public.ncm_support
  SET
    alertas = 'PROIBIDO enquadramento nos capítulos 90 (90.11 = microscópios e instrumentos ópticos) ou 85.28/85.25 — tripé/suporte mecânico não é instrumento óptico nem aparelho de imagem. Função primária de SUSTENTAÇÃO → 9620 (ausente na base) ou, como parte/acessório de câmera por Nota 2(b) Cap. 85, 85299090, com aviso ''confirmar no Siscomex''. Cabeças remotas motorizadas PTZ ou tripés convencionais de vídeo broadcast.',
    dicas = 'Atenção especial para tripés e monopés mecânicos convencionais de foto/vídeo sem função elétrica própria: o código específico internacional é 9620 (posição 96.20), porém ausente em imp_sim_tax_rates — apresentar com aviso Siscomex; alternativamente, enquadrar como parte/acessório exclusivo de câmera por Nota 2(b) do Cap. 85 na NCM 85299090 com aviso ''confirmar no Siscomex''. Suportes com motorização ou função própria independente recaem na 85437099.',
    updated_at = NOW()
  WHERE familia = 'Tripés, pedestais e suportes para câmeras de vídeo e broadcast'
     OR familia ILIKE '%Tripés, pedestais e suportes%';
END $$;
