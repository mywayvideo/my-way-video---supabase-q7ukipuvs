import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4.86.1'
import { corsHeaders } from '../_shared/cors.ts'

interface AnalyzeEditalRequest {
  licitacao_id: string
  texto_edital?: string
  force_reanalysis?: boolean
  itens_input?: Array<{
    n_item?: number
    descricao: string
    quantidade?: number
    unidade?: string
    valor_unitario_estimado?: number
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

    // 2. Monta o texto de análise (respeitando prioridade: parâmetro enviado > texto_integral salvo > objeto_completo/resumo)
    const rawText =
      (texto_edital || '').trim() ||
      (licitacao.texto_integral || '').trim() ||
      `${licitacao.objeto_resumo || ''}\n${licitacao.objeto_completo || ''}`

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
    const rawItens =
      itens_input && itens_input.length > 0
        ? itens_input
        : spreadsheetItens.length > 0
          ? spreadsheetItens
          : extrairItensDeterministicosDoTexto(rawText)

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
    // BLOCO JURÍDICO-ADMINISTRATIVO (LLM barato com Citação Obrigatória)
    // Usamos gpt-4o-mini (analyst) com prompt rígido exigindo citação textual
    // -------------------------------------------------------------
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || ''
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
    }

    let auditoriaUsada = 'extração_heuristica'
    let auditorDeepSeekUsado = false

    if (openaiApiKey && rawText.length > 30) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey })
        const prompt = `Você é um analista especialista em licitações públicas federais (Lei 14.133/2021 e 8.666/1993).
Analise o trecho do edital/TR abaixo e extraia com RIGOR JURÍDICO as regras e exigências.

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

TEXTO DO EDITAL:
"""
${rawText.slice(0, 15000)}
"""`

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        })

        const content = completion.choices[0]?.message?.content || '{}'
        const parsed = JSON.parse(content)
        juridicoExtracted = { ...juridicoExtracted, ...parsed }
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
            // Salva na auditoria
            await supabase.from('imp_sim_licitacao_auditoria_ia').insert({
              licitacao_id,
              fase: 'auditoria',
              modelo_usado: 'deepseek-chat',
              versao_funcao: 'v2.0-r2',
              output_json: dsOutput,
              status: 'concluido',
            })
          } catch (dsErr) {
            console.warn('Auditor DeepSeek (fronteira) ignorado por falha na chamada:', dsErr)
          }
        }
      } catch (llmErr) {
        console.error('Erro na extração LLM barato (gpt-4o-mini):', llmErr)
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

    if (totalEstimado > 0 && (!licitacao.valor_estimado || licitacao.valor_estimado === 0)) {
      updateHeader.valor_estimado = totalEstimado
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
        })
      }
    }

    // GATE DE SANIDADE MANDATÓRIO:
    // Se a análise terminar com 0 itens E 0 exigências, gravar status 'falha' (não 'concluido')
    const totalItensExtraidos = itensProcessados.length
    const totalExigenciasExtraidas = (juridicoExtracted.exigencias || []).length
    const gateSanidadeReprovado = totalItensExtraidos === 0 && totalExigenciasExtraidas === 0

    const finalPdfStatus =
      incomingPdfStatus || (gateSanidadeReprovado ? 'sem_texto_extraivel' : 'ok')
    const finalCaminhoRecomendado =
      incomingCaminho || (gateSanidadeReprovado ? 'upload_planilha_xlsx' : 'reanalisar')

    const finalAuditStatus = gateSanidadeReprovado ? 'falha' : 'concluido'
    const finalErroDetails = gateSanidadeReprovado
      ? 'Gate de Sanidade reprovado: 0 itens e 0 exigências extraídas — PDF sem camada de texto ou texto insuficiente; utilize o upload da planilha XLSX ou cole o texto do edital.'
      : null

    // Grava log de auditoria IA da extração
    const finalOutput = {
      catalog_coverage: catalogCoverageOverall,
      juridico: juridicoExtracted,
      itens_count: totalItensExtraidos,
      exigencias_count: totalExigenciasExtraidas,
      gate_sanidade_aprovado: !gateSanidadeReprovado,
      pdf_status: finalPdfStatus,
      caminho_recomendado: finalCaminhoRecomendado,
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
        juridico: juridicoExtracted,
        auditor_deepseek_acionado: auditorDeepSeekUsado,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Erro na função analyze-edital:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno no processamento de edital.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

/**
 * Extrai itens de maneira determinística via regex para casos onde
 * o edital descreve itens textualmente (Item 1, Lote 1, etc.).
 */
function extrairItensDeterministicosDoTexto(text: string) {
  const itens = []
  const itemRegex = /(?:item|lote)\s*(\d+)[\s:.-]+([^\n\r]+?)(?=(?:item|lote)\s*\d+|$)/gi
  let match
  let count = 0

  while ((match = itemRegex.exec(text)) !== null && count < 30) {
    count++
    const num = parseInt(match[1]) || count
    const desc = match[2].trim()
    if (desc.length > 5) {
      itens.push({
        n_item: num,
        descricao: desc,
        quantidade: 1,
        unidade: 'UN',
        valor_unitario_estimado: 0,
      })
    }
  }

  return itens
}
