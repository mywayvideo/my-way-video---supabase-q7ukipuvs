-- Migration: Create 'Cable & Connectors' category, update ncm_support keywords and activate tripods,
-- and migrate dollies and articulating arms to 'Tripods & Rigs'
-- Timestamp: 20261102200000

DO $$
DECLARE
  v_cable_category_id UUID;
  v_tripods_category_id UUID;
BEGIN
  -- 1. Criar ou atualizar a categoria 'Cable & Connectors' vinculada de forma idempotente
  -- acceptable_ncms: 8544.42.00, 8544.20.00, 8544.49.00, 8544.70.10, 8543.70.99, 8517.79.00, 8536.69.90 e 8536.69.10
  -- NUNCA 8536.69.00 (inexistente na Receita Federal)
  SELECT id INTO v_cable_category_id
  FROM public.categories
  WHERE LOWER(TRIM(name)) = 'cable & connectors'
  LIMIT 1;

  IF v_cable_category_id IS NULL THEN
    v_cable_category_id := gen_random_uuid();
    INSERT INTO public.categories (
      id,
      name,
      description,
      acceptable_ncms,
      is_active,
      created_at
    ) VALUES (
      v_cable_category_id,
      'Cable & Connectors',
      'Cabos de áudio, vídeo, transmissão, energia, rede e conectores/terminações montados ou avulsos',
      ARRAY['8544.42.00', '8544.20.00', '8544.49.00', '8544.70.10', '8543.70.99', '8517.79.00', '8536.69.90', '8536.69.10'],
      true,
      NOW()
    );
  ELSE
    UPDATE public.categories
    SET
      acceptable_ncms = ARRAY['8544.42.00', '8544.20.00', '8544.49.00', '8544.70.10', '8543.70.99', '8517.79.00', '8536.69.90', '8536.69.10'],
      is_active = true
    WHERE id = v_cable_category_id;
  END IF;

  -- 2. Atualizar palavras_chave da família ncm_support de cabos
  -- Família: "Cabos e chicotes de áudio, vídeo e transmissão montados com conectores"
  -- Acrescentar: 'cable & connectors', 'connectors', 'conectores'
  UPDATE public.ncm_support
  SET
    palavras_chave = ARRAY(
      SELECT DISTINCT LOWER(TRIM(elem))
      FROM unnest(
        COALESCE(palavras_chave, '{}'::text[]) ||
        ARRAY['cable & connectors', 'connectors', 'conectores', 'cable', 'cables', 'cabo', 'cabos', 'conector']
      ) AS elem
      WHERE elem IS NOT NULL AND elem <> ''
    ),
    categoria = 'Alimentação e conectividade (Seção H)',
    status = 'ativa',
    updated_at = NOW()
  WHERE familia ILIKE '%Cabos e chicotes%montados com conectores%';

  -- 3. Ativar a família ncm_support de tripés e suportes
  -- Família: "Tripés, pedestais e suportes para câmeras de vídeo e broadcast"
  -- Hoje em_revisao -> mudar para 'ativa' mantendo principal 96200000 e alternativas
  UPDATE public.ncm_support
  SET
    status = 'ativa',
    palavras_chave = ARRAY(
      SELECT DISTINCT LOWER(TRIM(elem))
      FROM unnest(
        COALESCE(palavras_chave, '{}'::text[]) ||
        ARRAY['dolly', 'dollies', 'pedestal', 'pedestais', 'braço articulado', 'braco articulado', 'articulating arm']
      ) AS elem
      WHERE elem IS NOT NULL AND elem <> ''
    ),
    updated_at = NOW()
  WHERE familia ILIKE '%Tripés, pedestais e suportes para câmeras%';

  -- 4. Migrar dollies e braços articulados (E-Image, Sachtler) direto para Tripods & Rigs
  SELECT id INTO v_tripods_category_id
  FROM public.categories
  WHERE LOWER(TRIM(name)) = 'tripods & rigs'
  LIMIT 1;

  IF v_tripods_category_id IS NOT NULL THEN
    UPDATE public.products
    SET
      category_id = v_tripods_category_id,
      category = 'Tripods & Rigs',
      updated_at = NOW(),
      last_reviewed_at = NOW()
    WHERE
      (
        (name ILIKE '%E-Image%' OR name ILIKE '%Sachtler%')
        AND
        (name ILIKE '%dolly%' OR name ILIKE '%dollies%' OR name ILIKE '%articulating arm%')
      )
      OR
      (
        sku IN ('EI-7003', 'EI-7004', 'EI-7004B', 'EI-7004C', 'EI-7005', 'EP880XK', 'EI-A50K', 'EI-A51', 'EI-A07R', 'S2055-0001')
      );
  END IF;

END $$;

NOTIFY pgrst, 'reload schema';
