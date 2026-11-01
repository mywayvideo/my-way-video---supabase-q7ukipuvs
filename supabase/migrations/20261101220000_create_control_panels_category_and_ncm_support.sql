-- Migração para:
-- 1. Criar categoria 'Control Panels' em public.categories com acceptable_ncms
-- 2. Criar linha 'Painéis de controle (switcher, color grading, câmera)' em public.ncm_support
-- 3. Enriquecer palavras_chave e termos de categorias da loja em linhas ncm_support
-- 4. Migrar produtos para a categoria vinculada Control Panels (sem mover CCUs, Teranex Smart Panel, blanks de rack ou Fairlight surfaces)

DO $$
DECLARE
  v_control_panels_id uuid;
  v_prod_count integer;
BEGIN
  -- 1. Criar ou atualizar a categoria 'Control Panels'
  SELECT id INTO v_control_panels_id FROM public.categories WHERE name = 'Control Panels';
  
  IF v_control_panels_id IS NULL THEN
    v_control_panels_id := gen_random_uuid();
    INSERT INTO public.categories (id, name, acceptable_ncms, is_active, created_at)
    VALUES (
      v_control_panels_id,
      'Control Panels',
      ARRAY['8471.60', '8543.70.99', '8529.90.90']::text[],
      true,
      now()
    );
  ELSE
    UPDATE public.categories
    SET acceptable_ncms = ARRAY['8471.60', '8543.70.99', '8529.90.90']::text[],
        is_active = true
    WHERE id = v_control_panels_id;
  END IF;

  -- 2. Inserir ou atualizar a linha ncm_support 'Painéis de controle (switcher, color grading, câmera)'
  -- Contém termos da categoria da loja ("control panels" e "painéis de controle") para o casamento funcionar
  IF NOT EXISTS (
    SELECT 1 FROM public.ncm_support 
    WHERE familia ILIKE '%Painéis de controle%'
  ) THEN
    INSERT INTO public.ncm_support (
      id,
      familia,
      categoria,
      palavras_chave,
      ncm_principal,
      ncm_alternativas,
      regra_desempate,
      dicas,
      alertas,
      fonte,
      status
    ) VALUES (
      gen_random_uuid(),
      'Painéis de controle (switcher, color grading, câmera)',
      'Painéis de controle e superfícies de edição / Control Panels',
      ARRAY[
        'control panel',
        'control panels',
        'paineis de controle',
        'painel de controle',
        'panel',
        'control surface',
        'trackball',
        't-bar',
        'advanced panel',
        'micro panel',
        'micro color panel',
        'mini panel',
        'speed editor',
        'camera control panel',
        'editor keyboard',
        'replay editor',
        'ptz controller'
      ],
      '84716090',
      '[
        {
          "ncm": "84716090",
          "rgi": "RGI 1 / Nota 5 E) Cap. 84",
          "quando": "Superfícies de controle de edição, color grading e pós-produção conectadas via USB/Ethernet operando primariamente como unidade periférica de entrada de computador/workstation (ex.: DaVinci Resolve Advanced, Mini, Micro Panel, Speed Editor, Editor Keyboard)",
          "observacao": "Unidade de entrada periférica para sistema de processamento de dados"
        },
        {
          "ncm": "85437099",
          "rgi": "RGI 1",
          "quando": "Painéis de controle físicos dedicados para switchers de produção/broadcast que controlam diretamente o mainframe comutador (ex.: ATEM 1/2/4 M/E Advanced Panel, ATEM Micro Live Stream Panel) como aparelho com função própria independente",
          "observacao": "Painel de controle de switcher broadcast com função própria"
        },
        {
          "ncm": "85299090",
          "rgi": "RGI 1 / Nota 2(b) Cap. 85",
          "quando": "Controladoras dedicadas de câmeras broadcast ou PTZ (ex.: ATEM Camera Control Panel, Canon RC-IP100/300/1000, Sony RM-IP500) operando como partes e acessórios dedicados de câmeras da posição 85.25",
          "observacao": "Controladoras de câmera (CCU/RCP) e mesas controladoras PTZ"
        }
      ]'::jsonb,
      'Se o painel for periférico de software/workstation (DaVinci/pós-produção) -> 8471.60. Se for painel comutador direto de switcher broadcast -> 8543.70.99. Se for controladora dedicada de câmeras broadcast/PTZ -> 8529.90.90.',
      'Superfícies DaVinci Resolve operam essencialmente com DaVinci Resolve em PC/Mac via USB/Ethernet (8471.60). Painéis ATEM Advanced controlam switchers físicos ATEM (8543.70.99). Controladoras RCP/PTZ controlam câmeras (8529.90.90).',
      'Não classificar painéis de switcher como periféricos de TI comuns quando projetados exclusivamente para comutação broadcast autônoma. Não confundir controladoras PTZ com roteadores de rede.',
      'Soluções de Consulta Cosit / NESH Cap. 84, 85',
      'ativa'
    );
  ELSE
    UPDATE public.ncm_support
    SET categoria = 'Painéis de controle e superfícies de edição / Control Panels',
        palavras_chave = ARRAY[
          'control panel',
          'control panels',
          'paineis de controle',
          'painel de controle',
          'panel',
          'control surface',
          'trackball',
          't-bar',
          'advanced panel',
          'micro panel',
          'micro color panel',
          'mini panel',
          'speed editor',
          'camera control panel',
          'editor keyboard',
          'replay editor',
          'ptz controller'
        ],
        ncm_principal = '84716090',
        ncm_alternativas = '[
          {
            "ncm": "84716090",
            "rgi": "RGI 1 / Nota 5 E) Cap. 84",
            "quando": "Superfícies de controle de edição, color grading e pós-produção conectadas via USB/Ethernet operando primariamente como unidade periférica de entrada de computador/workstation (ex.: DaVinci Resolve Advanced, Mini, Micro Panel, Speed Editor, Editor Keyboard)",
            "observacao": "Unidade de entrada periférica para sistema de processamento de dados"
          },
          {
            "ncm": "85437099",
            "rgi": "RGI 1",
            "quando": "Painéis de controle físicos dedicados para switchers de produção/broadcast que controlam diretamente o mainframe comutador (ex.: ATEM 1/2/4 M/E Advanced Panel, ATEM Micro Live Stream Panel) como aparelho com função própria independente",
            "observacao": "Painel de controle de switcher broadcast com função própria"
          },
          {
            "ncm": "85299090",
            "rgi": "RGI 1 / Nota 2(b) Cap. 85",
            "quando": "Controladoras dedicadas de câmeras broadcast ou PTZ (ex.: ATEM Camera Control Panel, Canon RC-IP100/300/1000, Sony RM-IP500) operando como partes e acessórios dedicados de câmeras da posição 85.25",
            "observacao": "Controladoras de câmera (CCU/RCP) e mesas controladoras PTZ"
          }
        ]'::jsonb,
        status = 'ativa',
        updated_at = now()
    WHERE familia ILIKE '%Painéis de controle%';
  END IF;

  -- 3. Enriquecer palavras_chave e campos de linhas ncm_support
  -- para garantir casamento com as categorias da loja quando o termo em comum estiver ausente:

  -- 3a. Família 'Roteadores e matrizes de comutação' <-> Categoria 'Networking & Storage'
  UPDATE public.ncm_support
  SET palavras_chave = ARRAY(
    SELECT DISTINCT unnest(palavras_chave || ARRAY['networking', 'storage', 'network', 'rede', 'switch de rede', 'network switch'])
  )
  WHERE id = '09b2c929-cbf2-4835-b662-14e8631ff41b'
     OR familia ILIKE '%Roteadores e matrizes%';

  -- 3b. Família 'Controladoras de câmera (RCU, RCP), mesas PTZ e manoplas servo-zoom' <-> Categoria 'Control Panels'
  UPDATE public.ncm_support
  SET palavras_chave = ARRAY(
    SELECT DISTINCT unnest(palavras_chave || ARRAY['control panels', 'control panel', 'paineis de controle', 'ptz controller', 'canon rc-ip', 'sony rm-ip'])
  )
  WHERE id = '6f0595a3-ebac-46d3-a426-e97ece67b5e6'
     OR familia ILIKE '%Controladoras de câmera%';

  -- 3c. Família 'Misturadores e switchers de vídeo broadcast' <-> Categoria 'Production Switchers'
  UPDATE public.ncm_support
  SET palavras_chave = ARRAY(
    SELECT DISTINCT unnest(palavras_chave || ARRAY['production switchers', 'production switcher'])
  )
  WHERE id = '9d7399b8-199b-4d79-90aa-c9f334b8c3b0'
     OR familia ILIKE '%Misturadores e switchers%';

  -- 3d. Família 'Fontes de alimentação e carregadores' <-> Categoria 'Batteries & Chargers'
  UPDATE public.ncm_support
  SET palavras_chave = ARRAY(
    SELECT DISTINCT unnest(palavras_chave || ARRAY['batteries', 'chargers', 'battery charger', 'baterias', 'carregador de bateria'])
  )
  WHERE id = '18663968-e377-42de-bcd0-8c68bff8029e'
     OR familia ILIKE '%Fontes de alimentação%';

  -- 3e. Família 'Gravadores de vídeo digitais, decks e servidores de exibição' <-> Categoria 'Recorders' e 'Networking & Storage'
  UPDATE public.ncm_support
  SET palavras_chave = ARRAY(
    SELECT DISTINCT unnest(palavras_chave || ARRAY['recorders', 'recorder', 'networking', 'storage'])
  )
  WHERE id = '570bcca0-0b96-4458-a1b0-5c2b2e88035b'
     OR familia ILIKE '%Gravadores de vídeo%';

  -- 3f. Família 'Cabos e chicotes' <-> Categoria 'Accessories'
  UPDATE public.ncm_support
  SET palavras_chave = ARRAY(
    SELECT DISTINCT unnest(palavras_chave || ARRAY['accessories', 'acessorios', 'cables', 'cabo'])
  )
  WHERE id = 'efc3365f-a1c9-440f-9352-35244ee2fbda'
     OR familia ILIKE '%Cabos e chicotes%';

  -- 4. Migração de produtos para a nova categoria 'Control Panels'
  -- Conjunto 1: Os 26 produtos que possuem category = 'Control Panel' (antiga)
  UPDATE public.products
  SET category_id = v_control_panels_id,
      category = 'Control Panels',
      updated_at = now()
  WHERE category = 'Control Panel'
    AND NOT (
      name ILIKE '%HDCU%' OR
      name ILIKE '%Teranex%Smart Panel%' OR
      name ILIKE '%Blank%' OR
      name ILIKE '%Fairlight%'
    );

  GET DIAGNOSTICS v_prod_count = ROW_COUNT;
  RAISE NOTICE 'Produtos com categoria antiga Control Panel migrados: %', v_prod_count;

  -- Conjunto 2: ATEM Advanced Panels (1/2/4 M/E) atualmente em Production Switchers
  UPDATE public.products
  SET category_id = v_control_panels_id,
      category = 'Control Panels',
      updated_at = now()
  WHERE (
    sku IN ('SWPANELADV1ME10', 'SWPANELADV1ME20', 'SWPANELADV1ME30', 'SWPANELADV2ME20', 'SWPANELADV2ME30', 'SWPANELADV4ME40')
    OR (name ILIKE '%ATEM%Advanced Panel%' AND category_id = 'd2e94dd1-5822-4577-bcca-29adb2456f57'::uuid)
  )
  AND NOT (
    name ILIKE '%HDCU%' OR
    name ILIKE '%Teranex%Smart Panel%' OR
    name ILIKE '%Blank%' OR
    name ILIKE '%Fairlight%'
  );

  GET DIAGNOSTICS v_prod_count = ROW_COUNT;
  RAISE NOTICE 'ATEM Advanced Panels migrados de Production Switchers: %', v_prod_count;

  -- Conjunto 3: PTZ controllers (Canon RC-IP100/300/1000 e Sony RM-IP500)
  UPDATE public.products
  SET category_id = v_control_panels_id,
      category = 'Control Panels',
      updated_at = now()
  WHERE sku IN ('5231C004', '7657C002', '6529C001', 'RMIP500')
     OR (name ILIKE '%RC-IP100 %' OR name ILIKE '%RC-IP1000%' OR name ILIKE '%RC-IP300%' OR name ILIKE '%RM-IP500%')
  AND NOT (
    name ILIKE '%HDCU%' OR
    name ILIKE '%Teranex%Smart Panel%' OR
    name ILIKE '%Blank%' OR
    name ILIKE '%Fairlight%'
  );

  GET DIAGNOSTICS v_prod_count = ROW_COUNT;
  RAISE NOTICE 'PTZ controllers migrados: %', v_prod_count;

END $$;

-- Notificar PostgREST para recarregar o schema imediatamente
NOTIFY pgrst, 'reload schema';
