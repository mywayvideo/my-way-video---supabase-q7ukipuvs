import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4.86.1'
import { corsHeaders } from '../_shared/cors.ts'

interface AnalyzeEditalRequest {
  licitacao_id: string
  texto_edital?: string
  texto_tr_dedicado?: string
  texto_habilitacao_dedicado?: string
  force_reanalysis?: boolean
  itens_input?: Array<{
    n_item?: number
    descricao: string
    quantidade?: number
    unidade?: string
    valor_unitario_estimado?: number
    marca_modelo?: string
    norma_abnt?: string
    prazo_entrega?: string
    garantia?: string
    fonte_origem?: string
  }>
}

interface JuridicoExigencia {
  categoria:
    | 'jurídica'
    | 'fiscal'
    | 'trabalhista'
    | 'econômico-financeira'
    | 'qualificação técnica'
    | 'SICAF'
    | 'SPEC'
    | 'fabricante'
    | 'sustentabilidade'
  documento: string
  clausula_ref?: string
  citacao_textual: string
  motivo_exigencia?: string
}

interface JuridicoAdministrativeExtracted {
  modalidade?: string
  criterio_julgamento?: string
  srp?: boolean
  adesao_ata?: boolean
  me_epp_exclusiva?: boolean
  garantia_exigida?: boolean
  garantia_tipo?: string
  garantia_valor?: number
  vistoria?: boolean
  amostra_prova_conceito?: boolean
  subcontratacao?: boolean
  consorcio?: boolean
  cooperativa?: boolean
  prazo_entrega?: string
  vigencia_contrato?: string
  prazo_pagamento?: string
  validade_proposta?: string
  valor_estimado?: number
  exigencias: JuridicoExigencia[]
  cronograma_eventos?: Array<{
    tipo_evento: string
    data_evento?: string
    base_legal?: string
    citacao?: string
  }>
}

function normalize(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('PROJECT_URL') || ''
    const supabaseKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body: AnalyzeEditalRequest & {
      pdf_status?: string
      caminho_recomendado?: string
    } = await req.json().catch(() => ({}))
    const {
      licitacao_id,
      texto_edital,
      texto_tr_dedicado,
      texto_habilitacao_dedicado,
      force_reanalysis = false,
      itens_input,
      pdf_status: incomingPdfStatus,
      caminho_recomendado: incomingCaminho,
    } = body

    if (!licitacao_id) {
      return new Response(JSON.stringify({ error: 'licitacao_id é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Carrega o edital do banco
    const { data: licitacao, error: licError } = await supabase
      .from('imp_sim_licitacoes')
      .select('*')
      .eq('id', licitacao_id)
      .single()

    if (licError || !licitacao) {
      return new Response(JSON.stringify({ error: 'Licitação não encontrada no banco.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Busca documentos dedicados no storage / anexos caso existam
    let trDocTexto = ''
    let habDocTexto = ''
    try {
      const { data: dedicatedDocs } = await supabase
        .from('imp_sim_licitacao_documentos')
        .select('*')
        .eq('licitacao_id', licitacao_id)
        .in('tipo_documento', ['tr_dedicado', 'habilitacao_dedicada', 'TR'])

      if (dedicatedDocs && dedicatedDocs.length > 0) {
        for (const doc of dedicatedDocs) {
          if (
            doc.tipo_documento === 'tr_dedicado' ||
            (doc.tipo_documento === 'TR' && !trDocTexto)
          ) {
            // Se for arquivo txt ou similar
            if (doc.arquivo_path && doc.arquivo_path.endsWith('.txt')) {
              const { data: b } = await supabase.storage
                .from('licitacao-documentos')
                .download(doc.arquivo_path)
              if (b) trDocTexto += '\n' + (await b.text())
            }
          } else if (doc.tipo_documento === 'habilitacao_dedicada') {
            if (doc.arquivo_path && doc.arquivo_path.endsWith('.txt')) {
              const { data: b } = await supabase.storage
                .from('licitacao-documentos')
                .download(doc.arquivo_path)
              if (b) habDocTexto += '\n' + (await b.text())
            }
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao ler docs dedicados:', e)
    }

    // Prioridade da fonte do Termo de Referência (Objeto):
    // 1) Parâmetro direto texto_tr_dedicado
    // 2) Doc dedicado tipo 'tr_dedicado'
    // 3) Coluna texto_termo_referencia da licitação
    // Fallback: texto do edital integral
    const trDedicadoText =
      (texto_tr_dedicado || '').trim() ||
      trDocTexto.trim() ||
      (licitacao.texto_termo_referencia || '').trim()

    // Prioridade da fonte de Habilitação / Informações do Pregão:
    // 1) Parâmetro direto texto_habilitacao_dedicado
    // 2) Doc dedicado tipo 'habilitacao_dedicada'
    // 3) Coluna texto_habilitacao da licitação
    // Fallback: texto do edital integral
    const habilitacaoDedicadaText =
      (texto_habilitacao_dedicado || '').trim() ||
      habDocTexto.trim() ||
      (licitacao.texto_habilitacao || '').trim()

    // Texto fallback do edital completo
    const fallbackEditalText =
      (texto_edital || '').trim() ||
      (licitacao.texto_integral || '').trim() ||
      `${licitacao.objeto_resumo || ''}\n${licitacao.objeto_completo || ''}`

    // Determina o texto específico para cada módulo
    const textoParaItens = trDedicadoText || fallbackEditalText
    const fonteItensUtilizada: 'TR dedicado' | 'Planilha' | 'Edital completo' =
      itens_input && itens_input.length > 0 && itens_input[0].fonte_origem === 'Planilha'
        ? 'Planilha'
        : trDedicadoText
          ? 'TR dedicado'
          : 'Edital completo'

    const textoParaJuridico = habilitacaoDedicadaText || fallbackEditalText
    const fonteJuridicoUtilizada: 'Habilitação dedicada' | 'Edital completo' =
      habilitacaoDedicadaText ? 'Habilitação dedicada' : 'Edital completo'

    const rawText = `${trDedicadoText ? '=== TERMO DE REFERÊNCIA (OBJETO / SERVIÇOS) ===\n' + trDedicadoText + '\n\n' : ''}${habilitacaoDedicadaText ? '=== HABILITAÇÃO E REQUISITOS DO PREGÃO ===\n' + habilitacaoDedicadaText + '\n\n' : ''}${fallbackEditalText}`

    // Chave de API OpenAI declarada no escopo principal para uso em todos os blocos opcionais
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || ''

    // 3. CACHE CANDIDATOS: Se já analisado e mesmo hash_documento e não for forçado, reusa
    // Apenas se a análise anterior concluída teve itens OU exigências (gate de sanidade válido)
    if (!force_reanalysis && licitacao.hash_documento) {
      const { data: existingAudits } = await supabase
        .from('imp_sim_licitacao_auditoria_ia')
        .select('*')
        .eq('licitacao_id', licitacao_id)
        .eq('status', 'concluido')
        .order('created_at', { ascending: false })
        .limit(1)

      if (existingAudits && existingAudits.length > 0) {
        const audit = existingAudits[0]
        const itensAudit = audit.output_json?.itens_count ?? 0
        const exigsAudit =
          audit.output_json?.exigencias_count ??
          (audit.output_json?.juridico?.exigencias?.length || 0)
        // Só devolve do cache se passou no gate de sanidade
        if (itensAudit > 0 || exigsAudit > 0) {
          return new Response(
            JSON.stringify({
              cached: true,
              message:
                'Resultado reutilizado do cache (mesmo hash). Utilize forçar reanálise para reprocessar.',
              audit_id: audit.id,
              versao_edital: licitacao.versao_edital,
              output: audit.output_json,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }
    }

    // 4. Carrega sinônimos e catálogo existente para catalog_coverage
    const [{ data: sinonimos }, { data: produtosCatalogo }] = await Promise.all([
      supabase.from('imp_sim_edital_sinonimos').select('*'),
      supabase.from('imp_sim_products').select('id, name, sku, ncm, price_nationalized_cost'),
    ])

    const sinList = sinonimos || []
    const prodList = produtosCatalogo || []

    // -------------------------------------------------------------
    // BLOCO TÉCNICO (Determinístico)
    // Extração/enriquecimento de itens da planilha/input ou do texto
    // Se o documento no storage for planilha XLSX/XLS/CSV, lê os itens também
    // -------------------------------------------------------------
    let spreadsheetItens: Array<{
      n_item?: number
      descricao: string
      quantidade?: number
      unidade?: string
      valor_unitario_estimado?: number
    }> = []

    // Verifica se há documento anexo do tipo planilha no banco da licitação
    try {
      const { data: docs } = await supabase
        .from('imp_sim_licitacao_documentos')
        .select('*')
        .eq('licitacao_id', licitacao_id)
        .order('created_at', { ascending: false })

      const planDoc = (docs || []).find(
        (d: any) =>
          d.tipo_documento === 'anexo' &&
          (d.arquivo_path?.toLowerCase().endsWith('.xlsx') ||
            d.arquivo_path?.toLowerCase().endsWith('.xls') ||
            d.arquivo_path?.toLowerCase().endsWith('.csv')),
      )

      if (planDoc && planDoc.arquivo_path) {
        const { data: fileBlob } = await supabase.storage
          .from('licitacao-documentos')
          .download(planDoc.arquivo_path)
        if (fileBlob) {
          const ab = await fileBlob.arrayBuffer()
          const XLSX = await import('npm:xlsx@0.18.5')
          const wb = XLSX.read(new Uint8Array(ab), { type: 'array' })
          if (wb.SheetNames && wb.SheetNames.length > 0) {
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
            // Procura itens nas linhas
            for (let r = 1; r < rows.length; r++) {
              const row = rows[r] || []
              const desc = String(row[1] || row[2] || '').trim()
              if (desc && desc.length > 3) {
                const qtd = parseFloat(String(row[2] || row[3] || '1').replace(',', '.')) || 1
                const val =
                  parseFloat(
                    String(row[4] || row[5] || '0')
                      .replace(/[R$\s.]/g, '')
                      .replace(',', '.'),
                  ) || 0
                spreadsheetItens.push({
                  n_item: spreadsheetItens.length + 1,
                  descricao: desc,
                  quantidade: qtd,
                  unidade: 'UN',
                  valor_unitario_estimado: val,
                })
              }
            }
          }
        }
      }
    } catch {
      // Ignora erro de leitura de planilha na edge function
    }

    const itensProcessados = []
    let rawItens =
      itens_input && itens_input.length > 0
        ? itens_input
        : spreadsheetItens.length > 0
          ? spreadsheetItens
          : extrairItensDeterministicosDoTexto(textoParaItens, fonteItensUtilizada)

    // Fallback com LLM (gpt-4o-mini) se o parser determinístico extraiu 0 itens
    // mas o texto possui conteúdo (> 100 caracteres)
    if (rawItens.length === 0 && openaiApiKey && textoParaItens.trim().length > 100) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey, timeout: 20000 })
        const promptItens = `Você é um analista especialista em licitações e compras públicas federais e estaduais.
Extraia com precisão a lista de itens/produtos/serviços a serem contratados ou adquiridos a partir do trecho de Termo de Referência ou Edital abaixo.

Para cada item encontrado, extraia cuidadosamente:
- n_item: número do item no edital (1, 2, ...)
- descricao: descrição clara do item/equipamento/serviço
- quantidade: quantidade numérica (padrão 1 se não especificado)
- unidade: unidade de medida (UN, peça, serviço, kit, etc. Padrão "UN")
- valor_unitario_estimado: VALOR UNITÁRIO ESTIMADO informado no documento para este item (ex.: 18400.00). Busque atenciosamente na planilha orçamentária, tabela de preços, estimativa de custos ou pesquisa de mercado citada no texto. Se o edital realmente NÃO informar nenhum valor estimado para o item, retorne estritamente 0 (NUNCA invente ou estime valores inexistentes no texto).
- marca_modelo: marca ou modelo de referência se houver, ou null
- norma_abnt: norma técnica citada (ex.: ABNT NBR 14565) ou null
- prazo_entrega: prazo de entrega do item se houver, ou null
- garantia: garantia mínima requerida se houver (ex.: 12 meses), ou null

Responda EXCLUSIVAMENTE em formato JSON puro:
{
  "itens": [
    {
      "n_item": 1,
      "descricao": "Lente teleobjetiva zoom profissional 70-200mm",
      "quantidade": 1,
      "unidade": "UN",
      "valor_unitario_estimado": 18400.00,
      "marca_modelo": "Nikon Z",
      "norma_abnt": null,
      "prazo_entrega": "30 dias",
      "garantia": "12 meses"
    }
  ]
}

Se realmente não houver nenhum produto ou serviço no texto, retorne {"itens": []}.

TEXTO DO TR / EDITAL:
"""
${textoParaItens.slice(0, 35000)}
"""`

        const completionItens = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: promptItens }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        })

        const contentItens = completionItens.choices[0]?.message?.content || '{}'
        const parsedItens = JSON.parse(contentItens)
        if (Array.isArray(parsedItens.itens) && parsedItens.itens.length > 0) {
          rawItens = parsedItens.itens.map((it: any, idx: number) => ({
            n_item: it.n_item || idx + 1,
            descricao: it.descricao || `Item ${idx + 1}`,
            quantidade: Number(it.quantidade) || 1,
            unidade: it.unidade || 'UN',
            valor_unitario_estimado: Number(it.valor_unitario_estimado) || 0,
            marca_modelo: it.marca_modelo || undefined,
            norma_abnt: it.norma_abnt || undefined,
            prazo_entrega: it.prazo_entrega || undefined,
            garantia: it.garantia || undefined,
            fonte_origem: fonteItensUtilizada,
          }))
        }
      } catch (errAiItens) {
        console.warn('Falha no fallback de IA para extração de itens (não fatal):', errAiItens)
      }
    }

    // Heurística determinística quando o edital é de item único e já possui valor_estimado global
    // (ex.: Fundação Padre Anchieta com R$ 18.400,00 na Habilitação/Aviso de Dispensa ou já gravado na licitação)
    const valorEstimadoGlobalLic = Number(licitacao.valor_estimado) || 0
    if (rawItens.length === 1 && (Number(rawItens[0].valor_unitario_estimado) || 0) === 0) {
      const valHab = extrairValorEstimadoDeTrecho(textoParaJuridico)
      const valDocCompleto = extrairValorEstimadoDeTrecho(rawText)
      const valCandidato =
        valHab > 0 ? valHab : valDocCompleto > 0 ? valDocCompleto : valorEstimadoGlobalLic
      if (valCandidato > 0) {
        const q = Number(rawItens[0].quantidade) || 1
        rawItens[0].valor_unitario_estimado = valCandidato / q
        rawItens[0].valor_total = valCandidato
      }
    }

    // -------------------------------------------------------------
    // PASSADA COMPLEMENTAR DO LLM PARA ITENS COM VALOR 0
    // À PROVA DE FALHAS:
    // - Try/catch geral e try/catch por item
    // - Timeout curto com AbortController (máx 15s)
    // - JSON validado rigorosamente
    // - Qualquer erro na IA é logado sem derrubar a análise
    // - REGRA DE OURO: Sem valor no texto, permanece 0 / editável
    // -------------------------------------------------------------
    const itensSemValor = rawItens.filter((it) => (Number(it.valor_unitario_estimado) || 0) === 0)
    if (
      itensSemValor.length > 0 &&
      openaiApiKey &&
      (textoParaItens.length > 50 || rawText.length > 50)
    ) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey, timeout: 15000 })
        const textoBuscaValores = (rawText.length > 1000 ? rawText : textoParaItens).slice(0, 35000)

        // Tenta uma chamada focada com timeout controlado
        const promptValores = `Você é um perito em orçamentos de licitações públicas.
Abaixo estão itens identificados em um edital/Termo de Referência cujo valor estimado ainda não foi localizado.
Analise o texto do documento e procure o VALOR UNITÁRIO ESTIMADO oficial do edital (orçamento estimado, valor de referência, planilha de custos, valor total de contratação ou pesquisa prévia de preços) para cada um dos itens listados.

REGRAS OBRIGATÓRIAS:
1. Extraia APENAS o valor unitário estimado que estiver explicitamente ou contextualmente indicado no documento para cada item.
2. NUNCA invente, presuma ou estime valores de mercado da sua cabeça. Se o documento NÃO trouxer o valor unitário estimado para determinado item, retorne estritamente 0 para aquele item.
3. Responda em JSON puro no formato:
{
  "valores": [
    { "n_item": 1, "valor_unitario_estimado": 18400.00 }
  ]
}

ITENS PARA BUSCA DE VALOR ESTIMADO:
${JSON.stringify(
  itensSemValor.map((it) => ({
    n_item: it.n_item,
    descricao: it.descricao,
    quantidade: it.quantidade,
  })),
  null,
  2,
)}

TEXTO DO EDITAL / TERMO DE REFERÊNCIA / HABILITAÇÃO:
"""
${textoBuscaValores}
"""`

        const compValores = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: promptValores }],
          temperature: 0.0,
          response_format: { type: 'json_object' },
        })

        const contentValores = compValores.choices[0]?.message?.content || '{}'
        let parsedValores: any = null
        try {
          parsedValores = JSON.parse(contentValores)
        } catch (jsonErr) {
          console.warn('JSON inválido retornado pelo LLM em compValores:', jsonErr)
        }

        if (parsedValores && Array.isArray(parsedValores.valores)) {
          const mapaValores = new Map<number, number>()
          for (const v of parsedValores.valores) {
            try {
              const num = Number(v?.n_item)
              const val = Number(v?.valor_unitario_estimado)
              if (!isNaN(num) && !isNaN(val) && val > 0) {
                mapaValores.set(num, val)
              }
            } catch (itemParseErr) {
              console.warn('Erro ao processar item do JSON de valores:', itemParseErr)
            }
          }

          rawItens = rawItens.map((it) => {
            const vEncontrado = mapaValores.get(it.n_item)
            if (
              (!it.valor_unitario_estimado || it.valor_unitario_estimado === 0) &&
              vEncontrado &&
              vEncontrado > 0
            ) {
              return {
                ...it,
                valor_unitario_estimado: vEncontrado,
                valor_total: (it.quantidade || 1) * vEncontrado,
              }
            }
            return it
          })
        }
      } catch (errAiValores) {
        console.warn(
          'Falha na passada complementar de LLM para valores (seguindo com valor 0):',
          errAiValores,
        )
      }
    }

    let totalEstimado = 0
    let itemsCobertos = 0

    for (let i = 0; i < rawItens.length; i++) {
      const raw = rawItens[i]
      const desc = raw.descricao || `Item ${i + 1}`
      const descNorm = normalize(desc)
      const qtd = Number(raw.quantidade) || 1
      const valUnit = Number(raw.valor_unitario_estimado) || 0
      const total = qtd * valUnit
      totalEstimado += total

      // Cruzamento de cobertura de catálogo por sinônimos e nomes
      const matchedProducts: string[] = []
      let coverageProduto = false

      for (const prod of prodList) {
        const prodNameNorm = normalize(prod.name)
        const prodSkuNorm = prod.sku ? normalize(prod.sku) : ''
        if (
          (prodSkuNorm && descNorm.includes(prodSkuNorm)) ||
          (prodNameNorm.length > 5 && descNorm.includes(prodNameNorm))
        ) {
          matchedProducts.push(prod.name)
          coverageProduto = true
        }
      }

      // Se não deu match direto por nome, busca por sinônimos
      let familiaEncontrada: string | null = null
      for (const sin of sinList) {
        const termoNorm = normalize(sin.termo_edital)
        if (termoNorm && descNorm.includes(termoNorm)) {
          familiaEncontrada = sin.familia_tecnica
          // Procura produtos nessa família técnica
          for (const prod of prodList) {
            if (normalize(prod.name).includes(termoNorm)) {
              if (!matchedProducts.includes(prod.name)) {
                matchedProducts.push(prod.name)
                coverageProduto = true
              }
            }
          }
        }
      }

      if (coverageProduto) {
        itemsCobertos++
      }

      // Pesquisa de mercado simulada/referencial com fontes reais do portfólio
      const pesquisaMercado = {
        fontes: [
          {
            fonte: 'B&H Photo Video / Lista Oficial Pro AV',
            referencia: 'Catálogo EUA / Distribuidor Oficial',
          },
          {
            fonte: 'Banco de Preços de Compras Governamentais (Painel de Preços)',
            referencia: 'Pregões Similares',
          },
        ],
        familia_identificada: familiaEncontrada,
        estimativa_mercado_brl: valUnit > 0 ? valUnit : undefined,
      }

      itensProcessados.push({
        n_item: raw.n_item || i + 1,
        n_lote: 1,
        descricao: desc,
        quantidade: qtd,
        unidade: raw.unidade || 'UN',
        valor_unitario_estimado: valUnit,
        valor_total: total,
        marca_modelo: (raw as any).marca_modelo || null,
        norma_abnt: (raw as any).norma_abnt || null,
        prazo_entrega_item: (raw as any).prazo_entrega || null,
        garantia_meses: (raw as any).garantia
          ? parseInt(String((raw as any).garantia).replace(/\D/g, '')) || null
          : null,
        fonte_origem: (raw as any).fonte_origem || fonteItensUtilizada,
        catalog_coverage: {
          coverage_produto: coverageProduto,
          coverage_servico: false,
          representacao_oficial: coverageProduto,
          produtos: matchedProducts.slice(0, 5),
        },
        candidatos_mercado: pesquisaMercado,
        status_analise: 'concluído',
      })
    }

    const catalogCoverageOverall = {
      total_itens: itensProcessados.length,
      itens_cobertos: itemsCobertos,
      percentual_cobertura:
        itensProcessados.length > 0
          ? Math.round((itemsCobertos / itensProcessados.length) * 100)
          : 0,
    }

    // -------------------------------------------------------------
    // BLOCO JURÍDICO-ADMINISTRATIVO (LLM com Citação Obrigatória)
    // Usamos gpt-4o-mini com prompt rígido exigindo citação textual
    // À prova de falhas: qualquer erro mantém campos conhecidos e completa normalmente
    // -------------------------------------------------------------
    let juridicoExtracted: JuridicoAdministrativeExtracted = {
      modalidade: licitacao.modalidade || 'pregão',
      criterio_julgamento: licitacao.criterio_julgamento || 'menor preço',
      srp: licitacao.srp ?? false,
      adesao_ata: licitacao.adesao_ata ?? false,
      me_epp_exclusiva: licitacao.me_epp_exclusiva ?? false,
      garantia_exigida: licitacao.garantia_exigida ?? false,
      vistoria: licitacao.vistoria ?? false,
      amostra_prova_conceito: licitacao.amostra_prova_conceito ?? false,
      subcontratacao: licitacao.subcontratacao ?? false,
      consorcio: licitacao.consorcio ?? false,
      cooperativa: licitacao.cooperativa ?? false,
      exigencias: [],
      cronograma_eventos: [],
    }

    let auditoriaUsada = 'extração_heuristica'
    let auditorDeepSeekUsado = false

    if (openaiApiKey && textoParaJuridico.length > 30) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey })
        // Divide o texto de habilitação em blocos de até ~60.000 caracteres
        const CHUNK_SIZE = 60000
        const textChunks: string[] = []
        for (let offset = 0; offset < textoParaJuridico.length; offset += CHUNK_SIZE) {
          textChunks.push(textoParaJuridico.slice(offset, offset + CHUNK_SIZE))
        }

        const todasExigencias: JuridicoExigencia[] = []
        const todosEventos: Array<{
          tipo_evento: string
          data_evento?: string
          base_legal?: string
          citacao?: string
        }> = []

        for (let chunkIdx = 0; chunkIdx < textChunks.length; chunkIdx++) {
          const chunk = textChunks[chunkIdx]
          const isFirstChunk = chunkIdx === 0
          const prompt = `Você é um analista especialista em licitações públicas federais (Lei 14.133/2021 e 8.666/1993).
Analise o trecho ${chunkIdx + 1}/${textChunks.length} da seção de Habilitação e Requisitos do pregão abaixo e extraia com RIGOR JURÍDICO as regras e exigências.

REGRA MANDATÓRIA: Toda exigência DEVE conter a "citacao_textual" EXATA do trecho do edital que a fundamenta. Se não houver citação no texto, NÃO invente.

Responda EXCLUSIVAMENTE em formato JSON puro, seguindo este schema:
{
  "modalidade": "pregão" | "concorrência" | "dispensa" | "inexigibilidade",
  "criterio_julgamento": "menor preço" | "maior desconto" | "técnica e preço",
  "srp": boolean,
  "adesao_ata": boolean,
  "me_epp_exclusiva": boolean,
  "garantia_exigida": boolean,
  "garantia_tipo": string ou null,
  "garantia_valor": number ou null,
  "vistoria": boolean,
  "amostra_prova_conceito": boolean,
  "subcontratacao": boolean,
  "consorcio": boolean,
  "cooperativa": boolean,
  "prazo_entrega": string ou null,
  "vigencia_contrato": string ou null,
  "prazo_pagamento": string ou null,
  "validade_proposta": string ou null,
  "exigencias": [
    {
      "categoria": "jurídica" | "fiscal" | "trabalhista" | "econômico-financeira" | "qualificação técnica" | "SICAF" | "SPEC" | "fabricante" | "sustentabilidade",
      "documento": "Nome do documento ou certidão exigida",
      "clausula_ref": "Número do item/cláusula (ex: 9.1.2)",
      "citacao_textual": "Trecho exato do edital entre aspas",
      "motivo_exigencia": "Breve justificativa legal"
    }
  ],
  "cronograma_eventos": [
    {
      "tipo_evento": "impugnação" | "esclarecimento" | "sessão" | "recurso" | "amostra" | "vistoria",
      "data_evento": "YYYY-MM-DD" ou null,
      "base_legal": "Artigo da Lei 14.133/2021",
      "citacao": "Trecho do edital que fixa o prazo"
    }
  ]
}

TEXTO DO EDITAL (TRECHO ${chunkIdx + 1}/${textChunks.length}):
"""
${chunk}
"""`

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          })

          const content = completion.choices[0]?.message?.content || '{}'
          const parsed = JSON.parse(content)

          // Se for o primeiro bloco, atualiza metadados gerais ou mescla com dados existentes
          if (isFirstChunk) {
            juridicoExtracted = {
              ...juridicoExtracted,
              ...parsed,
              exigencias: [],
              cronograma_eventos: [],
            }
          } else {
            // Blocos seguintes: atualiza campos caso o primeiro estivesse em branco/falso
            if (parsed.modalidade && !juridicoExtracted.modalidade)
              juridicoExtracted.modalidade = parsed.modalidade
            if (parsed.criterio_julgamento && !juridicoExtracted.criterio_julgamento)
              juridicoExtracted.criterio_julgamento = parsed.criterio_julgamento
            if (parsed.srp) juridicoExtracted.srp = true
            if (parsed.adesao_ata) juridicoExtracted.adesao_ata = true
            if (parsed.me_epp_exclusiva) juridicoExtracted.me_epp_exclusiva = true
            if (parsed.garantia_exigida) {
              juridicoExtracted.garantia_exigida = true
              if (parsed.garantia_tipo) juridicoExtracted.garantia_tipo = parsed.garantia_tipo
              if (parsed.garantia_valor) juridicoExtracted.garantia_valor = parsed.garantia_valor
            }
            if (parsed.vistoria) juridicoExtracted.vistoria = true
            if (parsed.amostra_prova_conceito) juridicoExtracted.amostra_prova_conceito = true
            if (parsed.subcontratacao) juridicoExtracted.subcontratacao = true
            if (parsed.consorcio) juridicoExtracted.consorcio = true
            if (parsed.cooperativa) juridicoExtracted.cooperativa = true
            if (parsed.prazo_entrega && !juridicoExtracted.prazo_entrega)
              juridicoExtracted.prazo_entrega = parsed.prazo_entrega
            if (parsed.vigencia_contrato && !juridicoExtracted.vigencia_contrato)
              juridicoExtracted.vigencia_contrato = parsed.vigencia_contrato
            if (parsed.prazo_pagamento && !juridicoExtracted.prazo_pagamento)
              juridicoExtracted.prazo_pagamento = parsed.prazo_pagamento
            if (parsed.validade_proposta && !juridicoExtracted.validade_proposta)
              juridicoExtracted.validade_proposta = parsed.validade_proposta
          }

          // Concatena exigências evitando duplicatas (por documento + clausula_ref ou citacao_textual)
          if (Array.isArray(parsed.exigencias)) {
            for (const ex of parsed.exigencias) {
              const docNorm = normalize(ex.documento || '')
              const clausulaNorm = normalize(ex.clausula_ref || '')
              const citacaoNorm = normalize(ex.citacao_textual || '')

              const isDuplicate = todasExigencias.some((item) => {
                const itemDocNorm = normalize(item.documento || '')
                const itemClausulaNorm = normalize(item.clausula_ref || '')
                const itemCitacaoNorm = normalize(item.citacao_textual || '')
                return (
                  (docNorm &&
                    itemDocNorm === docNorm &&
                    clausulaNorm &&
                    itemClausulaNorm === clausulaNorm) ||
                  (citacaoNorm.length > 20 && itemCitacaoNorm.includes(citacaoNorm.slice(0, 30)))
                )
              })

              if (!isDuplicate && (ex.documento || ex.citacao_textual)) {
                todasExigencias.push(ex)
              }
            }
          }

          // Concatena cronograma_eventos evitando duplicatas
          if (Array.isArray(parsed.cronograma_eventos)) {
            for (const ev of parsed.cronograma_eventos) {
              const tipoNorm = normalize(ev.tipo_evento || '')
              const dataStr = ev.data_evento || ''
              const isDupe = todosEventos.some(
                (item) => normalize(item.tipo_evento) === tipoNorm && item.data_evento === dataStr,
              )
              if (!isDupe && (ev.tipo_evento || ev.citacao)) {
                todosEventos.push(ev)
              }
            }
          }
        }

        juridicoExtracted.exigencias = todasExigencias
        juridicoExtracted.cronograma_eventos = todosEventos
        auditoriaUsada = 'gpt-4o-mini'

        // -----------------------------------------------------------
        // AUDITOR DEEPSEEK SOMENTE EM FRONTEIRA (casos duvidosos)
        // Casos de fronteira: amostra/poc ambígua, exigência restritiva de fabricante sem justificativa,
        // ou conflito em cláusula de ME/EPP.
        // -----------------------------------------------------------
        const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY')
        const isFronteira =
          juridicoExtracted.amostra_prova_conceito ||
          juridicoExtracted.vistoria ||
          juridicoExtracted.exigencias.some(
            (e) => e.categoria === 'fabricante' || e.categoria === 'qualificação técnica',
          )

        if (deepseekKey && isFronteira) {
          try {
            const deepseek = new OpenAI({
              apiKey: deepseekKey,
              baseURL: 'https://api.deepseek.com',
              timeout: 15000,
            })
            const auditPrompt = `Você é um auditor jurídico sênior de licitações públicas. Revise as exigências extraídas abaixo verificando se há riscos de direcionamento ou violação da Lei 14.133/2021 (ex.: exigência indevida de carta de solidariedade do fabricante, vistoria obrigatória sem opção de declaração).
Exigências: ${JSON.stringify(juridicoExtracted.exigencias.slice(0, 8))}
Retorne um parecer em JSON: {"risco_direcionamento": boolean, "motivo_auditoria": string, "recomendacao_impugnacao": string}`

            const dsRes = await deepseek.chat.completions.create({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: auditPrompt }],
              temperature: 0.1,
              response_format: { type: 'json_object' },
            })
            auditorDeepSeekUsado = true
            const dsOutput = JSON.parse(dsRes.choices[0]?.message?.content || '{}')
            // Salva na auditoria sem travar fluxo se falhar
            await supabase
              .from('imp_sim_licitacao_auditoria_ia')
              .insert({
                licitacao_id,
                fase: 'auditoria',
                modelo_usado: 'deepseek-chat',
                versao_funcao: 'v2.0-r2',
                output_json: dsOutput,
                status: 'concluido',
              })
              .catch((errDbDs: any) => console.warn('Erro ao salvar auditoria deepseek:', errDbDs))
          } catch (dsErr) {
            console.warn('Auditor DeepSeek (fronteira) ignorado por falha na chamada:', dsErr)
          }
        }
      } catch (llmErr) {
        console.error(
          'Erro na extração LLM (gpt-4o-mini) — mantendo dados determinísticos:',
          llmErr,
        )
      }
    }

    // 5. Salva os dados no banco
    // Atualiza cabeçalho com os dados extraídos
    const updateHeader: Record<string, unknown> = {
      modalidade: juridicoExtracted.modalidade || licitacao.modalidade,
      criterio_julgamento: juridicoExtracted.criterio_julgamento || licitacao.criterio_julgamento,
      srp: juridicoExtracted.srp ?? licitacao.srp,
      adesao_ata: juridicoExtracted.adesao_ata ?? licitacao.adesao_ata,
      me_epp_exclusiva: juridicoExtracted.me_epp_exclusiva ?? licitacao.me_epp_exclusiva,
      garantia_exigida: juridicoExtracted.garantia_exigida ?? licitacao.garantia_exigida,
      garantia_tipo: juridicoExtracted.garantia_tipo || licitacao.garantia_tipo,
      garantia_valor: juridicoExtracted.garantia_valor || licitacao.garantia_valor,
      vistoria: juridicoExtracted.vistoria ?? licitacao.vistoria,
      amostra_prova_conceito:
        juridicoExtracted.amostra_prova_conceito ?? licitacao.amostra_prova_conceito,
      subcontratacao: juridicoExtracted.subcontratacao ?? licitacao.subcontratacao,
      consorcio: juridicoExtracted.consorcio ?? licitacao.consorcio,
      cooperativa: juridicoExtracted.cooperativa ?? licitacao.cooperativa,
      prazo_entrega: juridicoExtracted.prazo_entrega || licitacao.prazo_entrega,
      vigencia_contrato: juridicoExtracted.vigencia_contrato || licitacao.vigencia_contrato,
      prazo_pagamento: juridicoExtracted.prazo_pagamento || licitacao.prazo_pagamento,
      validade_proposta: juridicoExtracted.validade_proposta || licitacao.validade_proposta,
      status: 'EM ANÁLISE TÉCNICA',
      updated_at: new Date().toISOString(),
    }

    if (totalEstimado > 0) {
      updateHeader.valor_estimado = totalEstimado
    } else if (
      (!licitacao.valor_estimado || licitacao.valor_estimado === 0) &&
      juridicoExtracted.valor_estimado &&
      juridicoExtracted.valor_estimado > 0
    ) {
      updateHeader.valor_estimado = juridicoExtracted.valor_estimado
    }

    await supabase.from('imp_sim_licitacoes').update(updateHeader).eq('id', licitacao_id)

    // Se houver itens novos, grava em imp_sim_licitacao_itens preservando itens manuais
    if (itensProcessados.length > 0) {
      // Remove itens anteriores se for reanálise forçada, preservando manuais
      if (force_reanalysis) {
        await supabase
          .from('imp_sim_licitacao_itens')
          .delete()
          .eq('licitacao_id', licitacao_id)
          .neq('revisado_manualmente', true)
      }

      for (const item of itensProcessados) {
        await supabase.from('imp_sim_licitacao_itens').insert({
          licitacao_id,
          ...item,
        })
      }
    }

    // Salva exigências de habilitação com as citações textuais obrigatórias
    if (juridicoExtracted.exigencias && juridicoExtracted.exigencias.length > 0) {
      if (force_reanalysis) {
        await supabase
          .from('imp_sim_licitacao_exigencias')
          .delete()
          .eq('licitacao_id', licitacao_id)
      }

      for (const ex of juridicoExtracted.exigencias) {
        await supabase.from('imp_sim_licitacao_exigencias').insert({
          licitacao_id,
          categoria: ex.categoria,
          documento: ex.documento,
          clausula_ref: ex.clausula_ref || null,
          status: 'exigido',
          observacao: ex.citacao_textual ? `Citação do edital: "${ex.citacao_textual}"` : null,
          fonte_obtencao: ex.motivo_exigencia || null,
          fonte_origem: fonteJuridicoUtilizada,
        })
      }
    }
    // GATE DE SANIDADE MANDATÓRIO:
    // Se a análise terminar com 0 itens E 0 exigências, gravar status 'falha' (não 'concluido')
    const totalItensExtraidos = itensProcessados.length
    const totalExigenciasExtraidas = (juridicoExtracted.exigencias || []).length
    const gateSanidadeReprovado = totalItensExtraidos === 0 && totalExigenciasExtraidas === 0

    const finalPdfStatus =
      incomingPdfStatus ||
      (gateSanidadeReprovado
        ? rawText.length >= 2000
          ? 'texto_sem_itens'
          : 'sem_texto_extraivel'
        : 'ok')
    const finalCaminhoRecomendado =
      incomingCaminho || (gateSanidadeReprovado ? 'upload_planilha_xlsx' : 'reanalisar')

    const finalAuditStatus = gateSanidadeReprovado ? 'falha' : 'concluido'
    const finalErroDetails = gateSanidadeReprovado
      ? rawText.length >= 2000
        ? `Nenhum item ou exigência identificado no texto analisado (texto recebido com ${rawText.length.toLocaleString('pt-BR')} caracteres) — verifique formatação do edital`
        : 'PDF sem camada de texto ou texto insuficiente (< 2.000 caracteres); utilize o upload da planilha XLSX ou cole o texto do edital na íntegra.'
      : null

    // Grava log de auditoria IA da extração
    const finalOutput = {
      catalog_coverage: catalogCoverageOverall,
      juridico: {
        ...juridicoExtracted,
        exigencias: (juridicoExtracted.exigencias || []).map((e) => ({
          ...e,
          fonte_origem: fonteJuridicoUtilizada,
        })),
      },
      itens_count: totalItensExtraidos,
      exigencias_count: totalExigenciasExtraidas,
      gate_sanidade_aprovado: !gateSanidadeReprovado,
      pdf_status: finalPdfStatus,
      caminho_recomendado: finalCaminhoRecomendado,
      fontes_utilizadas: {
        objeto_tr_fonte: fonteItensUtilizada,
        habilitacao_fonte: fonteJuridicoUtilizada,
      },
      auditor_deepseek_acionado: auditorDeepSeekUsado,
      motivo_falha: finalErroDetails,
    }

    const { data: auditRow } = await supabase
      .from('imp_sim_licitacao_auditoria_ia')
      .insert({
        licitacao_id,
        fase: 'extração',
        modelo_usado: auditoriaUsada,
        versao_funcao: 'v2.1-sanidade',
        input_hash: licitacao.hash_documento || null,
        output_json: finalOutput,
        status: finalAuditStatus,
        erro_details: finalErroDetails,
      })
      .select('id')
      .single()

    // VERSIONAMENTO: Grava nova versão da extração na tabela imp_sim_licitacao_versoes
    try {
      const { data: versoesAntigas } = await supabase
        .from('imp_sim_licitacao_versoes')
        .select('numero_versao')
        .eq('licitacao_id', licitacao_id)
        .order('numero_versao', { ascending: false })
        .limit(1)

      const proxVersao =
        versoesAntigas && versoesAntigas[0]?.numero_versao ? versoesAntigas[0].numero_versao + 1 : 1

      // Busca os itens finais do banco para snapshot completo
      const { data: itensSnapshot } = await supabase
        .from('imp_sim_licitacao_itens')
        .select('*')
        .eq('licitacao_id', licitacao_id)

      const { data: exigenciasSnapshot } = await supabase
        .from('imp_sim_licitacao_exigencias')
        .select('*')
        .eq('licitacao_id', licitacao_id)

      const jurSnapshot = {
        ...juridicoExtracted,
        exigencias: exigenciasSnapshot || [],
      }

      await supabase.from('imp_sim_licitacao_versoes').insert({
        licitacao_id,
        numero_versao: proxVersao,
        tipo_gatilho: force_reanalysis ? 'reanalise' : 'analise',
        descricao_versao: `Extração ${force_reanalysis ? 'reanalisada' : 'inicial'} (v${proxVersao}) - ${totalItensExtraidos} itens, ${totalExigenciasExtraidas} exigências`,
        itens_snapshot: itensSnapshot || [],
        juridico_snapshot: jurSnapshot,
        objeto_sintetizado: updateHeader.objeto_resumo || licitacao.objeto_resumo,
        objeto_citacao: (rawTr.length > 50 ? rawTr.slice(0, 350) : rawText.slice(0, 350)) + '...',
        destaques_criticos: [],
        fontes_utilizadas: {
          objeto_tr_fonte: fonteItensUtilizada,
          habilitacao_fonte: fonteJuridicoUtilizada,
        },
        total_itens: totalItensExtraidos,
        valor_total_estimado: updateHeader.valor_estimado || licitacao.valor_estimado || 0,
      })

      // Atualiza versão atual no cabeçalho
      await supabase
        .from('imp_sim_licitacoes')
        .update({ versao_analise_atual: proxVersao })
        .eq('id', licitacao_id)
    } catch (vErr) {
      console.warn('Erro ao gravar versão versionada da extração:', vErr)
    }

    return new Response(
      JSON.stringify({
        success: !gateSanidadeReprovado,
        status: finalAuditStatus,
        erro_details: finalErroDetails,
        pdf_status: finalPdfStatus,
        caminho_recomendado: finalCaminhoRecomendado,
        cached: false,
        audit_id: auditRow?.id,
        catalog_coverage: catalogCoverageOverall,
        itens: itensProcessados,
        juridico: {
          ...juridicoExtracted,
          exigencias: (juridicoExtracted.exigencias || []).map((e) => ({
            ...e,
            fonte_origem: fonteJuridicoUtilizada,
          })),
        },
        fontes_utilizadas: {
          objeto_tr_fonte: fonteItensUtilizada,
          habilitacao_fonte: fonteJuridicoUtilizada,
        },
        auditor_deepseek_acionado: auditorDeepSeekUsado,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Erro geral não tratado na função analyze-edital:', error)
    // Tenta atualizar o status da licitação e gravar log de erro para não deixá-la pendente/sem resposta
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('PROJECT_URL') || ''
      const supabaseKey =
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey)
        const bodyFallback = await req
          .clone()
          .json()
          .catch(() => ({}))
        const licId = bodyFallback?.licitacao_id
        if (licId) {
          await supabase
            .from('imp_sim_licitacoes')
            .update({ status: 'EM ANÁLISE TÉCNICA', updated_at: new Date().toISOString() })
            .eq('id', licId)
            .catch(() => {})

          await supabase
            .from('imp_sim_licitacao_auditoria_ia')
            .insert({
              licitacao_id: licId,
              fase: 'extração',
              modelo_usado: 'fallback_error_recovery',
              versao_funcao: 'v2.1-sanidade',
              status: 'falha',
              erro_details: error?.message || 'Erro interno inesperado',
              output_json: { error: error?.message || 'Erro desconhecido' },
            })
            .catch(() => {})
        }
      }
    } catch {
      // Ignora erro no salvamento do fallback
    }

    return new Response(
      JSON.stringify({
        error: error.message || 'Erro interno no processamento de edital.',
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

/**
 * Extrai itens de maneira determinística via regex para casos onde
 * o edital descreve itens textualmente (Item 1, Lote 1, etc.).
 * Suporta itens em linha própria com flag /m e término em fim de linha.
 */
export function extrairValorMonetarioBrasileiro(str: string): number {
  if (!str) return 0
  const cleaned = str
    .replace(/[R$\s\xa0]/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  const num = parseFloat(cleaned)
  return isNaN(num) || num < 0 ? 0 : num
}

export function extrairValorEstimadoDeTrecho(trecho: string): number {
  if (!trecho) return 0

  // 1. Padrão explícito com palavras-chave de valor estimado / unitário
  const padraoExplicito =
    /(?:valor\s*(?:unit[áa]rio)?\s*estimado|pre[çc]o\s*(?:unit[áa]rio)?\s*estimado|valor\s*(?:de\s*)?refer[êe]ncia|pre[çc]o\s*(?:de\s*)?refer[êe]ncia|estimativa\s*(?:de\s*)?pre[çc]o|custo\s*estimado|valor\s*m[áa]ximo\s*(?:aceit[áa]vel)?)\s*(?:[:=–\-]|de\s+)?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/i
  const mExp = trecho.match(padraoExplicito)
  if (mExp && mExp[1]) {
    const val = extrairValorMonetarioBrasileiro(mExp[1])
    if (val > 0) return val
  }

  // 2. Padrão com símbolo R$ explícito
  const padraoRS = /(?:R\$\s*)(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/i
  const mRS = trecho.match(padraoRS)
  if (mRS && mRS[1]) {
    const val = extrairValorMonetarioBrasileiro(mRS[1])
    if (val > 0) return val
  }

  return 0
}

function isProcessoEditalInformativo(valor: string | null | undefined): boolean {
  if (!valor) return false
  const trimmed = valor.trim()
  if (!trimmed) return false

  if (
    /^(?:edital|processo|preg[ãa]o|artefato|termo(?:\s+de\s+refer[êe]ncia)?|uasg)?\s*\d{1,5}\/\d{4}(?:\s*(?:informa[çc][õo]es?|informa|edital|processo|preg[ãa]o|ano|fls?\.?|sei|cgu))?$/i.test(
      trimmed,
    )
  ) {
    return true
  }
  if (/^\d{1,5}\/\d{4}\b/i.test(trimmed)) {
    return true
  }
  if (/\b(?:informa[çc][õo]es\s+b[áa]sicas|informa\b)/i.test(trimmed) && /\d{4}/.test(trimmed)) {
    return true
  }
  if (/^\d+$/.test(trimmed) || /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return true
  }
  return false
}

function extrairMarcaModeloSegura(texto: string): string | undefined {
  if (!texto) return undefined

  const padraoExplicito =
    /(?:marca(?:\/modelo)?|modelo|refer[êe]ncia|fabricante)\s*[:\-–]\s*([A-Za-z0-9\s/+\-_]{2,50})/i
  const mExp = texto.match(padraoExplicito)
  if (mExp && mExp[1]) {
    const limpo = mExp[1].split(/[,;.\n\r]/)[0]?.trim()
    if (limpo && !isProcessoEditalInformativo(limpo) && limpo.length >= 2) {
      return limpo
    }
  }

  const padraoModeloInline =
    /\b(?:marca|modelo|fabricante)\s+([A-Za-z0-9][A-Za-z0-9\s/+\-_]{1,40})/i
  const mInline = texto.match(padraoModeloInline)
  if (mInline && mInline[1]) {
    const limpo = mInline[1]
      .split(/[,;.\n\r]|(?:\b(?:garantia|prazo|norma|quantidade|valor)\b)/i)[0]
      ?.trim()
    if (limpo && !isProcessoEditalInformativo(limpo) && limpo.length >= 2) {
      return limpo
    }
  }

  const padraoCompativel =
    /(?:compat[íi]vel\s+com(?:\s+o\s+sistema\s+de\s+montagem)?)\s*[:\-–]?\s*([A-Za-z0-9\s/+\-_]{3,40})/i
  const mCompat = texto.match(padraoCompativel)
  if (mCompat && mCompat[1]) {
    const limpo = mCompat[1].split(/[,;.\n\r]/)[0]?.trim()
    if (limpo && !isProcessoEditalInformativo(limpo) && limpo.length >= 3) {
      return limpo
    }
  }

  return undefined
}

export function extrairItensDeterministicosDoTexto(
  text: string,
  fonteOrigem: 'TR dedicado' | 'Edital completo' | 'Planilha' = 'Edital completo',
) {
  const itens: Array<{
    n_item: number
    descricao: string
    quantidade: number
    unidade: string
    valor_unitario_estimado: number
    valor_total?: number
    marca_modelo?: string
    norma_abnt?: string
    prazo_entrega?: string
    garantia?: string
    fonte_origem?: string
  }> = []
  const itemRegex = /(?:^|\n)\s*(?:item|lote)\s*(\d+)\s*[:.\-–]?\s*([^\n\r]{6,})/gim
  let match
  let count = 0
  const seenNumbers = new Set<number>()

  while ((match = itemRegex.exec(text)) !== null && count < 30) {
    const rawNum = parseInt(match[1], 10)
    const num = isNaN(rawNum) ? count + 1 : rawNum
    // Se já encontramos esse número de item antes, pula para evitar duplicatas por referências posteriores
    if (seenNumbers.has(num)) {
      continue
    }

    let desc = (match[2] || '').trim()
    // Limpa pontuações ou traços soltos no início/fim
    desc = desc
      .replace(/^[:.\-–\s]+/, '')
      .replace(/[\s;.]+$/, '')
      .trim()

    if (desc.length >= 6) {
      seenNumbers.add(num)
      count++

      // Extração de especificações complementares
      const marcaModelo = extrairMarcaModeloSegura(desc)

      let normaAbnt: string | undefined
      const abntMatch = desc.match(/(?:ABNT\s*NBR\s*[\d\-]+|NBR\s*[\d\-]+|ISO\s*[\d\-]+)/i)
      if (abntMatch && abntMatch[0]) {
        normaAbnt = abntMatch[0].trim()
      }

      let prazoEntrega: string | undefined
      const prazoMatch = desc.match(
        /(?:prazo\s*(?:de\s*)?entrega\s*[:\-–]?\s*(\d+\s*(?:dias|meses)[^,;.\n]*))/i,
      )
      if (prazoMatch && prazoMatch[1]) {
        prazoEntrega = prazoMatch[1].trim()
      }

      let garantia: string | undefined
      const garantiaMatch = desc.match(
        /(?:garantia\s*(?:m[íi]nima\s*)?[:\-–]?\s*(\d+\s*(?:meses|anos)[^,;.\n]*))/i,
      )
      if (garantiaMatch && garantiaMatch[1]) {
        garantia = garantiaMatch[1].trim()
      }

      let qtd = 1
      const qtdMatch = desc.match(/(?:quant(?:\.|idade)?|qtd\.?)\s*[:\-–]?\s*(\d+)/i)
      if (qtdMatch && qtdMatch[1]) {
        const q = parseInt(qtdMatch[1], 10)
        if (!isNaN(q) && q > 0) qtd = q
      }

      const matchIndex = match.index || 0
      const contextoAdjacente = text.slice(matchIndex, matchIndex + 700)
      let valorUnit = extrairValorEstimadoDeTrecho(desc)
      if (valorUnit === 0) {
        valorUnit = extrairValorEstimadoDeTrecho(contextoAdjacente)
      }
      const valorTotal = valorUnit > 0 ? valorUnit * qtd : 0

      itens.push({
        n_item: num,
        descricao: desc,
        quantidade: qtd,
        unidade: 'UN',
        valor_unitario_estimado: valorUnit,
        valor_total: valorTotal,
        marca_modelo: marcaModelo,
        norma_abnt: normaAbnt,
        prazo_entrega: prazoEntrega,
        garantia: garantia,
        fonte_origem: fonteOrigem,
      })
    }
  }

  // Fallback 1: detecção de tabela compacta "ITEM DESCRIÇÃO Unid. QUANTIDADE \n 1 un 1" ou com descrição após
  // Exemplo CGU / Padre Anchieta:
  // "Objetivo: LENTE TELEOBJETIVA 70-200MM (NIKON Z)"
  // "ITEM DESCRIÇÃO Unid. QUANTIDADE \n 1 un 1"
  if (itens.length === 0) {
    const tabelaPadraoComValor =
      /(?:ITEM\s+DESCRI[ÇC][ÃA]O\s+(?:Unid\.?|Unidade)\s+QUANTIDADE[\s\S]{0,100}?(?:VALOR|PRE[ÇC]O)|ITEM\s+QUANTIDADE\s+DESCRI[ÇC][ÃA]O)[\s\S]{0,400}?\b(\d+)\s+([a-zA-Z]{1,5})\s+(\d+)(?:[^\n\r\d]{1,30})?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2}))?/i
    const mTabVal = text.match(tabelaPadraoComValor)

    const tabelaPadrao =
      /(?:ITEM\s+DESCRI[ÇC][ÃA]O\s+(?:Unid\.?|Unidade)\s+QUANTIDADE|ITEM\s+QUANTIDADE\s+DESCRI[ÇC][ÃA]O)[\s\S]{0,300}?\b(\d+)\s+([a-zA-Z]{1,5})\s+(\d+)/i
    const mTab = mTabVal || text.match(tabelaPadrao)

    if (mTab) {
      const num = parseInt(mTab[1], 10) || 1
      const unid = (mTab[2] || 'UN').toUpperCase()
      const qtd = parseInt(mTab[3], 10) || 1

      // Busca a descrição do objeto nas proximidades ou no início
      let descObj = ''
      const mObjHead = text.match(/(?:Objetivo|Objeto)\s*:\s*([^\n\r]{6,150})/i)
      if (mObjHead && mObjHead[1]) {
        descObj = mObjHead[1].trim()
      } else {
        const mObjSec = text.match(
          /(?:1\.\s*OBJETO|DO OBJETO|DEFINIÇÃO DO OBJETO)[\s\S]{0,100}?(?:adquirir|aquisi[çc][ãa]o\s+de)\s+([^\n\r;.]{10,200})/i,
        )
        if (mObjSec && mObjSec[1]) {
          descObj = mObjSec[1].trim()
        }
      }

      if (descObj) {
        let marcaModelo = extrairMarcaModeloSegura(descObj)
        if (!marcaModelo) {
          const contextoBusca = text.slice(0, Math.min(text.length, 3000))
          marcaModelo = extrairMarcaModeloSegura(contextoBusca)
        }

        let normaAbnt: string | undefined
        const abntMatch = text.match(/(?:ABNT\s*NBR\s*[\d-]+|NBR\s*[\d-]+|ISO\s*[\d-]+)/i)
        if (abntMatch && abntMatch[0]) {
          normaAbnt = abntMatch[0].trim()
        }

        let prazoEntrega: string | undefined
        const prazoMatch = text.match(
          /(?:prazo\s*(?:de\s*)?entrega\s*[:\-–]?\s*(\d+\s*(?:dias|meses)[^,;.\n]*))/i,
        )
        if (prazoMatch && prazoMatch[1]) {
          prazoEntrega = prazoMatch[1].trim()
        }

        let garantia: string | undefined
        const garantiaMatch = text.match(
          /(?:garantia\s*(?:m[íi]nima\s*)?[:\-–]?\s*(\d+\s*(?:meses|anos)[^,;.\n]*))/i,
        )
        if (garantiaMatch && garantiaMatch[1]) {
          garantia = garantiaMatch[1].trim()
        }

        let valorUnit = 0
        if (mTabVal && mTabVal[4]) {
          valorUnit = extrairValorMonetarioBrasileiro(mTabVal[4])
        }
        if (valorUnit === 0) {
          const mTabIdx = mTab.index || 0
          const contextoTabela = text.slice(Math.max(0, mTabIdx - 100), mTabIdx + 400)
          valorUnit = extrairValorEstimadoDeTrecho(contextoTabela)
        }
        if (valorUnit === 0) {
          valorUnit = extrairValorEstimadoDeTrecho(text)
        }
        const valorTotal = valorUnit > 0 ? valorUnit * qtd : 0

        itens.push({
          n_item: num,
          descricao: descObj,
          quantidade: qtd,
          unidade: unid,
          valor_unitario_estimado: valorUnit,
          valor_total: valorTotal,
          marca_modelo: marcaModelo,
          norma_abnt: normaAbnt,
          prazo_entrega: prazoEntrega,
          garantia: garantia,
          fonte_origem: fonteOrigem,
        })
      }
    }
  }

  // Fallback 2: Objeto único explícito no TR / Termo de Referência
  // Ex: "1.1. O objetivo da contratação é adquirir 01 (uma) lente teleobjetiva zoom profissional..."
  // ou "1. OBJETO Aquisição de 01 (uma) lente teleobjetiva zoom profissional para câmera mirrorless..."
  if (itens.length === 0) {
    const singleObjRegex =
      /(?:1\.1\.?\s*O objetivo da contrata[çc][ãa]o [eé] adquirir|1\.\s*OBJETO\s+(?:Aquisi[çc][ãa]o de|Contrata[çc][ãa]o de)|DO OBJETO\s+(?:Aquisi[çc][ãa]o de|Contrata[çc][ãa]o de))\s+(\d{1,4})?\s*(?:\([a-zA-Z]+\))?\s*([^\n\r.;]{10,250})/i
    const mSingle = text.match(singleObjRegex)
    if (mSingle) {
      const qtdRaw = mSingle[1] ? parseInt(mSingle[1], 10) : 1
      const qtd = isNaN(qtdRaw) || qtdRaw <= 0 ? 1 : qtdRaw
      let desc = (mSingle[2] || '').trim()
      desc = desc
        .replace(/^[:.\-–\s]+/, '')
        .replace(/[\s;.]+$/, '')
        .trim()

      if (desc.length >= 10) {
        let marcaModelo = extrairMarcaModeloSegura(desc)
        if (!marcaModelo) {
          const contextoBusca = text.slice(0, Math.min(text.length, 3000))
          marcaModelo = extrairMarcaModeloSegura(contextoBusca)
        }

        let normaAbnt: string | undefined
        const abntMatch = text.match(/(?:ABNT\s*NBR\s*[\d-]+|NBR\s*[\d-]+|ISO\s*[\d-]+)/i)
        if (abntMatch && abntMatch[0]) {
          normaAbnt = abntMatch[0].trim()
        }

        let prazoEntrega: string | undefined
        const prazoMatch = text.match(
          /(?:prazo\s*(?:de\s*)?entrega\s*[:\-–]?\s*(\d+\s*(?:dias|meses)[^,;.\n]*))/i,
        )
        if (prazoMatch && prazoMatch[1]) {
          prazoEntrega = prazoMatch[1].trim()
        }

        let garantia: string | undefined
        const garantiaMatch = text.match(
          /(?:garantia\s*(?:m[íi]nima\s*)?[:\-–]?\s*(\d+\s*(?:meses|anos)[^,;.\n]*))/i,
        )
        if (garantiaMatch && garantiaMatch[1]) {
          garantia = garantiaMatch[1].trim()
        }

        const valorUnit = extrairValorEstimadoDeTrecho(text)
        const valorTotal = valorUnit > 0 ? valorUnit * qtd : 0

        itens.push({
          n_item: 1,
          descricao: desc,
          quantidade: qtd,
          unidade: 'UN',
          valor_unitario_estimado: valorUnit,
          valor_total: valorTotal,
          marca_modelo: marcaModelo,
          norma_abnt: normaAbnt,
          prazo_entrega: prazoEntrega,
          garantia: garantia,
          fonte_origem: fonteOrigem,
        })
      }
    }
  }

  return itens
}
