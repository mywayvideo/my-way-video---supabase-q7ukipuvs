-- Migration: 20261001000000_create_ncm_support_table.sql
-- TABELA DE APOIO DE CLASSIFICAÇÃO NCM (ncm_support)
-- Camada de conhecimento de domínio consultável pelo classify-ncm e gerenciável pelo admin

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. CREATE TABLE
CREATE TABLE IF NOT EXISTS public.ncm_support (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia text NOT NULL,                         -- ex.: "Câmeras de vídeo/cinema/broadcast"
  categoria text,                                -- ex.: "Captura de imagem" (seção do diretório)
  palavras_chave text[] NOT NULL DEFAULT '{}',   -- ex.: {câmera, camcorder, PTZ, cinema, broadcast}
  ncm_principal text NOT NULL,
  ncm_alternativas jsonb NOT NULL DEFAULT '[]',  -- [{ncm, quando, rgi, observacao}]
  regra_desempate text,                          -- ex.: "3+ captadores → 85258921; 1–2 → 85258929"
  dicas text,
  alertas text,                                  -- ex.: "85258090 EXTINTO — não usar"
  fonte text,                                    -- SC Cosit, resolução, link Siscomex
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','extinta','em_revisao')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_ncm_support_palavras ON public.ncm_support USING gin (palavras_chave array_ops);
CREATE INDEX IF NOT EXISTS idx_ncm_support_ncm ON public.ncm_support (ncm_principal);
CREATE INDEX IF NOT EXISTS idx_ncm_support_familia_trgm ON public.ncm_support USING gin (familia gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ncm_support_status ON public.ncm_support (status);

-- 4. TRIGGER UPDATED_AT
CREATE OR REPLACE FUNCTION public.handle_ncm_support_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ncm_support_updated_at ON public.ncm_support;
CREATE TRIGGER trg_ncm_support_updated_at
  BEFORE UPDATE ON public.ncm_support
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_ncm_support_updated_at();

-- 5. TRIGGER DE VIGÊNCIA (Salvaguarda 2.1)
-- Recusa INSERT/UPDATE com ncm_principal ou qualquer ncm_alternativas->ncm inexistente em public.imp_sim_tax_rates
CREATE OR REPLACE FUNCTION public.validate_ncm_support_vigencia()
RETURNS trigger AS $$
DECLARE
  v_item jsonb;
  v_ncm_alt text;
  v_exists boolean;
BEGIN
  -- Validar ncm_principal
  IF NEW.ncm_principal IS NULL OR length(trim(NEW.ncm_principal)) = 0 THEN
    RAISE EXCEPTION 'ncm_principal não pode ser vazio';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.imp_sim_tax_rates WHERE ncm = trim(NEW.ncm_principal)
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'NCM principal % não existe na tabela de tarifas vigentes (imp_sim_tax_rates)', NEW.ncm_principal;
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
          RAISE EXCEPTION 'NCM alternativo % não existe na tabela de tarifas vigentes (imp_sim_tax_rates)', v_ncm_alt;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ncm_support_vigencia ON public.ncm_support;
CREATE TRIGGER trg_ncm_support_vigencia
  BEFORE INSERT OR UPDATE OF ncm_principal, ncm_alternativas ON public.ncm_support
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ncm_support_vigencia();

-- 6. RLS POLICIES
ALTER TABLE public.ncm_support ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read ncm_support" ON public.ncm_support;
CREATE POLICY "Admin read ncm_support" ON public.ncm_support
  FOR SELECT
  TO authenticated
  USING (public.check_is_admin());

DROP POLICY IF EXISTS "Admin insert ncm_support" ON public.ncm_support;
CREATE POLICY "Admin insert ncm_support" ON public.ncm_support
  FOR INSERT
  TO authenticated
  WITH CHECK (public.check_is_admin());

DROP POLICY IF EXISTS "Admin update ncm_support" ON public.ncm_support;
CREATE POLICY "Admin update ncm_support" ON public.ncm_support
  FOR UPDATE
  TO authenticated
  USING (public.check_is_admin())
  WITH CHECK (public.check_is_admin());

DROP POLICY IF EXISTS "Admin delete ncm_support" ON public.ncm_support;
CREATE POLICY "Admin delete ncm_support" ON public.ncm_support
  FOR DELETE
  TO authenticated
  USING (public.check_is_admin());

-- 7. SEEDS INICIAIS (Seções A-H do diretorio_ncm.md migrados)
-- Todos os NCMs abaixo foram verificados e existem em imp_sim_tax_rates
INSERT INTO public.ncm_support (familia, categoria, palavras_chave, ncm_principal, ncm_alternativas, regra_desempate, dicas, alertas, fonte, status)
VALUES
  (
    'Câmeras de vídeo/cinema/broadcast e filmadoras',
    'Captura de imagem (Seção A)',
    ARRAY['câmera', 'camera', 'camcorder', 'cinema', 'broadcast', 'filmadoras', 'PTZ', 'mirrorless', 'DSLR', 'sensor', 'captador'],
    '85258929',
    jsonb_build_array(
      jsonb_build_object('ncm', '85258921', 'quando', 'Câmeras profissionais com 3 ou mais sensores/captadores de imagem CCD/CMOS dedicados (ex.: Sony HDC-3200R)', 'rgi', 'RGI 1 / 6', 'observacao', 'Alíquota diferenciada para equipamentos de estúdio broadcast 3-chips'),
      jsonb_build_object('ncm', '85437099', 'quando', 'Enquadramento genérico residual de aparelhos com função própria', 'rgi', 'RGI 1', 'observacao', 'Alternativa genérica')
    ),
    '3 ou mais captadores de imagem independentes → 85258921; 1 ou 2 captadores (maioria esmagadora cinema/mirrorless/PTZ/camcorders, como FX5, FX6, FX9, URSA Mini Pro, Cinema Camera 6K) → 85258929.',
    'Verifique sempre na ficha técnica o número de sensores de imagem (CCD/CMOS). Se mono-sensor grande formato (Full Frame, Super35) com 1 chip, é 85258929.',
    '85258090 EXTINTO — não usar sob hipótese alguma (reestruturação HS 2022). Veto total ao código extinto.',
    'Nomenclatura Comum do Mercosul 2022 / Resolução Gecex / Diretório NCM Seção A',
    'ativa'
  ),
  (
    'Misturadores e switchers de vídeo broadcast',
    'Processamento e chaveamento de vídeo (Seção B)',
    ARRAY['switcher', 'misturador', 'video mixer', 'produção de vídeo', 'atem', 'constellation', 'tricaster', 'entradas de vídeo'],
    '85437035',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437039', 'quando', 'Misturadores com menos de 8 entradas físicas ativas de vídeo', 'rgi', 'RGI 1 / 6', 'observacao', 'Subposição residual de misturadores'),
      jsonb_build_object('ncm', '85437036', 'quando', 'Equipamento cuja função primária declarada for matriz de comutação pura (routing switcher)', 'rgi', 'RGI 1 / 6', 'observacao', 'Exige >20 entradas e >16 saídas'),
      jsonb_build_object('ncm', '85437099', 'quando', 'Aparelhos de funções especiais ou processadores auxiliares', 'rgi', 'RGI 1', 'observacao', 'Alternativa residual')
    ),
    '8 ou mais entradas de vídeo ativas (digitais SDI/HDMI) → 85437035; menos de 8 entradas → 85437039. Switcher com efeitos/DVE/áudio mixer é misturador, NÃO é matriz (85437036).',
    'Linhas ATEM Mini Extreme (8 entradas), ATEM 1 M/E Constellation (10 entradas), 2 M/E (20 entradas), 4 M/E (40 entradas), ATEM SDI Extreme têm 8+ entradas → 85437035.',
    'Não confundir switcher de produção ao vivo (85437035) com matriz de roteamento pura (85437036).',
    'Diretório NCM Seção B / Resolução Gecex',
    'ativa'
  ),
  (
    'Roteadores e matrizes de comutação de áudio/vídeo (Routing Switchers)',
    'Processamento e chaveamento de vídeo (Seção B)',
    ARRAY['matriz', 'matrix', 'router', 'routing switcher', 'videohub', 'comutador de matriz', 'crosspoint'],
    '85437036',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437039', 'quando', 'Matrizes de pequeno porte com até 20 entradas ou até 16 saídas', 'rgi', 'RGI 1 / 6', 'observacao', 'Outros roteadores/comutadores'),
      jsonb_build_object('ncm', '85437035', 'quando', 'Equipamento que também desempenha mixagem/efeitos em tempo real', 'rgi', 'RGI 1', 'observacao', 'Misturador se houver mixagem'),
      jsonb_build_object('ncm', '85437099', 'quando', 'Alternativa residual de menor carga ou sem enquadramento específico', 'rgi', 'RGI 1', 'observacao', 'Ex 164 ou residual')
    ),
    'Mais de 20 entradas e mais de 16 saídas puramente de comutação (ex.: Smart Videohub 40x40, CleanSwitch 12x12 NÃO se enquadra por ter ≤20 entradas) → 85437036; matrizes menores → 85437039.',
    'Apenas matrizes estritamente com >20 in E >16 out atendem a descrição exata do 85437036.',
    'Verificar número exato de crosspoints bidirecionais ou unidirecionais.',
    'Diretório NCM Seção B',
    'ativa'
  ),
  (
    'Microfones e sistemas sem fio de áudio',
    'Áudio profissional (Seção C)',
    ARRAY['microfone', 'microphone', 'lapela', 'wireless', 'bastão', 'transmissor de bolso', 'headset', 'microfonia', 'uwp'],
    '85181090',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437099', 'quando', 'Kits sem fio onde o receptor/transmissor de RF seja considerado função autônoma ou residual', 'rgi', 'RGI 3(b) / 1', 'observacao', 'Alternativa comum em sistemas sem fio de áudio'),
      jsonb_build_object('ncm', '85184000', 'quando', 'Equipamento amplificado de mesa integrado', 'rgi', 'RGI 1', 'observacao', 'Amplificador')
    ),
    'Microfones e seus suportes, mesmo em kits sem fio com receptor/transmissor (caráter essencial microfone RGI 3b) → 85181090. Alternativa genérica 85437099.',
    'Kit UWP-D21 (lapela + transmissor + receptor) tem caráter essencial de captação de microfone (85181090), com alternativa genérica em 85437099.',
    'Não classificar como mero transmissor de rádio se o conjunto funciona para captação microfônica.',
    'Solução de Consulta Cosit / Diretório NCM Seção C',
    'ativa'
  ),
  (
    'Caixas acústicas e monitores de áudio de estúdio',
    'Áudio profissional (Seção C)',
    ARRAY['caixa acústica', 'monitor de áudio', 'alto-falante', 'speaker', 'studio monitor', 'soundbar', 'subwoofer'],
    '85182200',
    jsonb_build_array(
      jsonb_build_object('ncm', '85184000', 'quando', 'Se classificado primariamente pelo circuito amplificador elétrico embutido', 'rgi', 'RGI 1', 'observacao', 'Amplificador de audiofrequência'),
      jsonb_build_object('ncm', '85437099', 'quando', 'Processador de caixas de áudio digital ativo', 'rgi', 'RGI 1', 'observacao', 'Residual')
    ),
    'Alto-falantes múltiplos montados na mesma caixa acústica (woofer + tweeter num único gabinete, padrão nearfield) → 85182200.',
    'Monitores de referência ativos de estúdio (Yamaha HS series, Genelec, Neumann) possuem alto-falantes múltiplos na mesma caixa.',
    'Caixa com único transdutor de banda larga iria para subposição específica.',
    'Diretório NCM Seção C',
    'ativa'
  ),
  (
    'Mesas de som analógicas/digitais e amplificadores de áudio',
    'Áudio profissional (Seção C)',
    ARRAY['mesa de som', 'audio mixer', 'mixer de áudio', 'amplificador de som', 'console de áudio', 'pré-amplificador'],
    '85184000',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437099', 'quando', 'Consoles digitais avançados com processamento DSP complexo', 'rgi', 'RGI 1', 'observacao', 'Aparelhos com função própria'),
      jsonb_build_object('ncm', '85181090', 'quando', 'Mesas integradas com microfone conferência', 'rgi', 'RGI 3(b)', 'observacao', 'Microfonia')
    ),
    'Amplificadores elétricos de audiofrequência e mesas de som que amplificam sinais de áudio analógico/digital → 85184000.',
    'Diferenciar mesas de áudio (8518) de mesas/switchers de vídeo (8543).',
    'Não usar posições de vídeo para consoles exclusivamente sonoros.',
    'Diretório NCM Seção C',
    'ativa'
  ),
  (
    'Monitores profissionais de vídeo e displays para computadores',
    'Monitores e visualização (Seção D)',
    ARRAY['monitor', 'display', 'oled', 'lcd', 'monitor de referência', 'viewfinder', 'tela hdmi', 'sdi monitor'],
    '85285200',
    jsonb_build_array(
      jsonb_build_object('ncm', '85285900', 'quando', 'Monitores de vídeo não concebidos primariamente para computador (monitores de estúdio/broadcast puramente SDI/composto)', 'rgi', 'RGI 1 / 6', 'observacao', 'Outros monitores policromáticos'),
      jsonb_build_object('ncm', '85299090', 'quando', 'Viewfinder dedicado sem carcaça independente concebido como parte de câmera', 'rgi', 'Nota 2(b) Cap. 85', 'observacao', 'Partes de câmera')
    ),
    'Monitores capazes de serem conectados diretamente a máquinas de processamento de dados (84.71) com portas DisplayPort/HDMI/USB-C → 85285200; monitores estritamente broadcast (apenas SDI/BNC sem foco PC) → 85285900.',
    'Maioria esmagadora dos monitores modernos de estúdio possui portas HDMI/DisplayPort compatíveis com PC.',
    'Viewfinders acoplados sem uso autônomo são partes (85299090).',
    'Diretório NCM Seção D',
    'ativa'
  ),
  (
    'Projetores de vídeo e imagem',
    'Monitores e visualização (Seção D)',
    ARRAY['projetor', 'projector', 'datashow', 'canhão de projeção', 'dmd', 'dlp', 'laser projector'],
    '85286910',
    jsonb_build_array(
      jsonb_build_object('ncm', '85286990', 'quando', 'Projetores sem tecnologia DMD (LCD transmissive, LCoS, outros)', 'rgi', 'RGI 1 / 6', 'observacao', 'Outros projetores de vídeo')
    ),
    'Projetores com tecnologia digital micromirror device (DMD/DLP) → 85286910; demais tecnologias (3LCD/LCoS) → 85286990.',
    'O código genérico 85286900 não possui alíquota na base interna; deve-se usar a subposição granular 85286910 (DMD) ou 85286990 (outros).',
    'Verificar a matriz de projeção óptica na especificação do fabricante.',
    'Diretório NCM Seção D',
    'ativa'
  ),
  (
    'Instrumentos de medição de vídeo (Waveform Monitors e Vectorscopes)',
    'Medição e controle (Seção D)',
    ARRAY['waveform', 'vectorscope', 'monitor de forma de onda', 'osciloscópio de vídeo', 'analisador de sinal sdi', 'rasterizer'],
    '90308990',
    jsonb_build_array(
      jsonb_build_object('ncm', '85285900', 'quando', 'Aparelho cuja função primária for monitor de visualização de vídeo com waveform como recurso de software secundário', 'rgi', 'RGI 3(b) / 1', 'observacao', 'Monitor com software'),
      jsonb_build_object('ncm', '85437099', 'quando', 'Geradores de sincronismo e sinais de teste de vídeo', 'rgi', 'RGI 1', 'observacao', 'Aparelho função própria')
    ),
    'Instrumentos e aparelhos de medida e controle de grandezas elétricas e sinais de televisão/vídeo (pos. 90.30) → 90308990. Na base interna, o código 903089 é subitem 90308990.',
    'Equipamentos dedicados da Leader, Tektronix, Omnitek cujo objetivo é diagnosticar e aferir forma de onda e vetor de cor.',
    'Se for um monitor de campo comum com função waveform overlay em software, classificar como monitor (85285200/85285900).',
    'Diretório NCM Seção D',
    'ativa'
  ),
  (
    'Gravadores de vídeo digitais, decks e servidores de exibição',
    'Gravação e reprodução (Seção E)',
    ARRAY['gravador', 'video recorder', 'hyperdeck', 'deck', 'video server', 'ssd recorder', 'ki pro', 'shogun'],
    '85219000',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437099', 'quando', 'Servidores de replay e codificadores avançados de vídeo', 'rgi', 'RGI 1', 'observacao', 'Aparelhos com função própria'),
      jsonb_build_object('ncm', '85285200', 'quando', 'Aparelho tipo monitor-gravador de campo onde a função de display é predominante', 'rgi', 'RGI 3(b)', 'observacao', 'Monitor de referência')
    ),
    'Aparelhos de gravação ou de reprodução de vídeo, mesmo incorporando um receptor de sinais de televisão, sem fita magnética (gravação digital em SSD/SD/disco) → 85219000.',
    'Aparelhos dedicados como Blackmagic HyperDeck Studio, AJA Ki Pro.',
    'Aparelhos híbridos monitor+gravador (ex: Atomos Ninja/Shogun) avaliar caráter essencial conforme uso preponderante.',
    'Diretório NCM Seção E',
    'ativa'
  ),
  (
    'Painéis, refletores e luminárias de LED para estúdio',
    'Iluminação e estúdio (Seção F)',
    ARRAY['iluminação', 'painel led', 'refletor', 'fresnel led', 'softlight', 'luz de estúdio', 'ring light', 'luminária'],
    '94054200',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437099', 'quando', 'Controladores e mesas DMX de iluminação cênica', 'rgi', 'RGI 1', 'observacao', 'Aparelho de comando/controle')
    ),
    'Aparelhos de iluminação elétricos de LED para estúdios, fotografia e cinema → 94054200.',
    'Aputure, Nanlite, Godox, ARRI SkyPanel, Kino Flo.',
    'Capítulo 94 para luminárias e refletores completos; acessórios avulsos como tripés e difusores não têm alíquota direta nesta posição.',
    'Diretório NCM Seção F',
    'ativa'
  ),
  (
    'Controladoras de câmera (RCU, RCP), mesas PTZ e manoplas servo-zoom',
    'Partes e acessórios de câmeras (Seção G)',
    ARRAY['rcp', 'rcu', 'painel de controle', 'ptz controller', 'mesa ptz', 'manopla', 'servo zoom', 'rm-ip500', 'partes de câmera'],
    '85299090',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437099', 'quando', 'Alternativa genérica obrigatória de áudio e vídeo profissional residual', 'rgi', 'RGI 1', 'observacao', 'Aparelho de controle com função própria independente'),
      jsonb_build_object('ncm', '85369090', 'quando', 'Conexões e chaves elétricas simples sem protocolo dedicado', 'rgi', 'RGI 1', 'observacao', 'Aparelhagem para interrupção/seccionamento')
    ),
    'Partes e comandos concebidos exclusiva ou principalmente para câmeras das posições 85.25 a 85.28 (Nota 2(b) do Cap. 85) → 85299090. Alternativa genérica 85437099 deve SEMPRE constar.',
    'Painéis remotos como Sony RM-IP500, RCP-1500, manoplas servo zoom para objetivas acopladas à câmera enquadram-se como partes/acessórios dependentes em 85299090.',
    '85437099 deve SEMPRE constar nas alternativas por ser enquadramento residual aceito para consoles com processamento interno autônomo.',
    'Diretório NCM Seção G / Nota Legal 2(b) Cap. 85',
    'ativa'
  ),
  (
    'Objetivas fotográficas e de televisão/cinema',
    'Óptica e lentes (Seção G)',
    ARRAY['lente', 'objetiva', 'lens', 'cinema lens', 'broadcast lens', 'zoom lens', 'prime lens'],
    '90021120',
    jsonb_build_array(
      jsonb_build_object('ncm', '90021190', 'quando', 'Outras lentes de câmeras fotográficas ou de cinema sem zoom de 20x ou fixas', 'rgi', 'RGI 1 / 6', 'observacao', 'Outras objetivas de câmeras'),
      jsonb_build_object('ncm', '90021900', 'quando', 'Objetivas para outros instrumentos ópticos', 'rgi', 'RGI 1 / 6', 'observacao', 'Outras objetivas')
    ),
    'Objetivas de aproximação (zoom) para câmeras de televisão de 20 ou mais aumentos → 90021120; outras objetivas para câmeras (fixas, grande angular, cinema prime) → 90021190.',
    'Lentes broadcast tipo box B4 de grande zoom costumam atingir 20x ou mais (ex: Fujinon UA, Canon UHD-DIGISUPER).',
    'Lentes prime (focais fixas) vão para 90021190.',
    'Diretório NCM Seção G / Posição 90.02',
    'ativa'
  ),
  (
    'Fontes de alimentação e carregadores para equipamentos de vídeo',
    'Alimentação e conectividade (Seção H)',
    ARRAY['fonte', 'power supply', 'carregador', 'charger', 'adaptador ac', 'conversor ac/dc', 'eliminador de bateria'],
    '85044010',
    jsonb_build_array(
      jsonb_build_object('ncm', '85044021', 'quando', 'Conversores estáticos de semicondutores / cristal', 'rgi', 'RGI 1 / 6', 'observacao', 'Conversores estáticos'),
      jsonb_build_object('ncm', '85044090', 'quando', 'Outros conversores estáticos e retificadores', 'rgi', 'RGI 1 / 6', 'observacao', 'Outras fontes')
    ),
    'Carregadores de acumuladores (baterias V-Mount, Gold Mount, baterias de câmera) → 85044010; fontes de alimentação AC/DC sem função de recarga → 85044021 ou 85044090.',
    'Diferenciar carregador de bateria (85044010) de fonte de bancada/alimentação direta contínua.',
    'Não classificar baterias como fontes (baterias vão para posição 85.07).',
    'Diretório NCM Seção H',
    'ativa'
  ),
  (
    'Cabos e chicotes de áudio, vídeo e transmissão montados com conectores',
    'Alimentação e conectividade (Seção H)',
    ARRAY['cabo', 'cable', 'sdi cable', 'hdmi cable', 'xlr cable', 'patch cord', 'chicote'],
    '85444200',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437099', 'quando', 'Cabos ativos com chips conversores integrados nas ponteiras', 'rgi', 'RGI 1', 'observacao', 'Aparelho com função própria')
    ),
    'Condutores elétricos para tensão não superior a 1.000 V munidos de peças de conexão (conectores BNC, HDMI, XLR, P10) → 85444200.',
    'Cabos prontos para uso em broadcast são cabos munidos de conectores.',
    'Cabos em bobina sem conectores pertencem a outra subposição (854449).',
    'Diretório NCM Seção H',
    'ativa'
  ),
  (
    'Tripés, pedestais e suportes para câmeras de vídeo e broadcast',
    'Suportes mecânicos (Seção F)',
    ARRAY['tripé', 'tripod', 'monopé', 'pedestal', 'suporte de câmera', 'cabeça fluida', 'dolly', 'rig mecânico'],
    '85299090',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437099', 'quando', 'Suportes motorizados ou cabeças remotas de controle elétrico com função própria', 'rgi', 'RGI 1', 'observacao', 'Aparelho elétrico com função própria')
    ),
    'Acessórios e suportes mecânicos concebidos exclusiva ou principalmente para câmeras de televisão/vídeo (Nota 2b Cap. 85) utilizam 85299090 quando não houver alíquota na posição de tripés.',
    'O código específico internacional da posição 96.20 (tripés e monopés) não possui alíquotas cadastradas na base interna (imp_sim_tax_rates) — confirmar no Siscomex caso seja exigido enquadramento estrito no Cap. 96.',
    'Cabeças remotas motorizadas PTZ ou tripés convencionais de vídeo broadcast.',
    'Diretório NCM Seção F / Salvaguarda NCM base interna',
    'ativa'
  ),
  (
    'Racks, gabinetes e móveis técnicos para estúdio',
    'Móveis técnicos e infraestrutura (Seção F)',
    ARRAY['rack', 'gabinete técnico', 'rack 19', 'rack broadcast', 'armário de equipamentos', 'estante técnica'],
    '85299090',
    jsonb_build_array(
      jsonb_build_object('ncm', '85437099', 'quando', 'Racks com distribuição de energia e controle integrado', 'rgi', 'RGI 1', 'observacao', 'Alternativa genérica')
    ),
    'Mobiliário técnico e racks metálicos dedicados à montagem de aparelhos de áudio e vídeo de transmissão.',
    'O código do diretório da posição 94.03 (móveis de metal/racks) não possui alíquota cadastrada na base interna (imp_sim_tax_rates) — confirmar no Siscomex a alíquota exata da posição 94032000.',
    'Se for fornecido com módulos eletrônicos de comutação embutidos, avaliar o conjunto.',
    'Diretório NCM Seção F / Salvaguarda NCM base interna',
    'ativa'
  ),
  (
    'Modificadores de luz, softboxes e difusores ópticos',
    'Iluminação e estúdio (Seção F)',
    ARRAY['difusor', 'softbox', 'colmeia', 'grid', 'barndoor', 'gelatina', 'modificador de luz', 'sombrinha'],
    '94054200',
    jsonb_build_array(
      jsonb_build_object('ncm', '85299090', 'quando', 'Acessórios mecânicos montados diretamente no corpo de câmeras', 'rgi', 'RGI 1', 'observacao', 'Partes de câmera')
    ),
    'Acessórios e modificadores ópticos/mecânicos concebidos para luminárias de estúdio.',
    'Códigos do Capítulo 39 (plásticos) ou tecidos sintéticos avulsos não possuem alíquotas cadastradas na base interna — confirmar no Siscomex se classificado individualmente como artefato de plástico.',
    'Quando comercializado em conjunto com o refletor, classifica-se com a luminária (94054200).',
    'Diretório NCM Seção F / Salvaguarda NCM base interna',
    'ativa'
  )
ON CONFLICT (id) DO NOTHING;
