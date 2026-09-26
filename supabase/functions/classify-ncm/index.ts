import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

interface ClassifyRequestBody {
  product_description: string
  brand?: string
  model?: string
  additional_specs?: string
  top_n?: number
  save_log?: boolean
  product_id?: string
  imp_sim_product_id?: string
}

interface WebSource {
  title: string
  url: string
  snippet?: string
}

interface LLMProviderConfig {
  id: string
  provider_name: string
  provider_type?: string
  model_id: string
  api_key_secret_name: string
  custom_endpoint?: string
  priority_order?: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  // 1. Validação de método HTTP
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Validação e extração de Auth JWT do Supabase
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({
        error: 'Cabeçalho Authorization ausente ou malformado. Requer Bearer <JWT>.',
      }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) {
    return new Response(
      JSON.stringify({ error: 'Token JWT ausente no cabeçalho Authorization.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''

  // Cliente autenticado com o JWT do chamador para verificar identidade
  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })

  // Cliente admin com service_role para ler tabelas protegidas (ai_providers, efetivas, logs)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser()

  if (userError || !user) {
    return new Response(
      JSON.stringify({
        error: 'JWT inválido ou expirado.',
        details: userError?.message,
      }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 3. Leitura e validação do payload de entrada
  let body: ClassifyRequestBody
  try {
    body = await req.json()
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'JSON malformado no corpo da requisição.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const productDescription = (body.product_description || '').trim()
  if (!productDescription || productDescription.length < 3) {
    return new Response(
      JSON.stringify({
        error: 'O campo product_description é obrigatório e deve conter no mínimo 3 caracteres.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const brand = (body.brand || '').trim()
  const model = (body.model || '').trim()
  const additionalSpecs = (body.additional_specs || '').trim()
  const topN = Math.max(5, Math.min(Number(body.top_n) || 15, 30))
  const saveLog = body.save_log !== false
  const productId = body.product_id || null
  const impSimProductId = body.imp_sim_product_id || null

  try {
    // 4. Montar query unificada para recuperação de candidatos NCM
    const queryParts = [productDescription]
    if (brand && !productDescription.toLowerCase().includes(brand.toLowerCase())) {
      queryParts.unshift(brand)
    }
    if (model && !productDescription.toLowerCase().includes(model.toLowerCase())) {
      queryParts.push(model)
    }
    if (additionalSpecs) {
      queryParts.push(additionalSpecs)
    }
    const fullQuery = queryParts.join(' ').trim()

    // 5. Gerar embedding vetorial da consulta se OpenAI API key estiver disponível
    let queryEmbedding: number[] | null = null
    const openAiKey = Deno.env.get('OPENAI_API_KEY') || ''
    if (openAiKey) {
      try {
        queryEmbedding = await generateEmbedding(fullQuery, openAiKey)
      } catch (embErr) {
        console.warn(
          'Falha ao gerar embedding para query NCM (continuando com busca textual):',
          embErr,
        )
      }
    }

    // 6. Recuperar candidatos via RPC search_ncm_candidates (PostgreSQL pgvector + trigramas)
    // A base abrange capítulos 84, 85, 90 e 94 sem restrição
    const rpcParams: {
      query: string
      query_embedding?: string | null
      top_n: number
      match_threshold: number
    } = {
      query: fullQuery,
      top_n: topN,
      match_threshold: 0.04,
    }

    if (queryEmbedding && queryEmbedding.length > 0) {
      rpcParams.query_embedding = `[${queryEmbedding.join(',')}]`
    }

    const { data: rawCandidates, error: rpcError } = await supabaseAdmin.rpc(
      'search_ncm_candidates',
      rpcParams,
    )

    if (rpcError) {
      console.error('Erro na RPC search_ncm_candidates:', rpcError)
      return new Response(
        JSON.stringify({
          error: 'Falha ao buscar candidatos fiscais no banco.',
          details: rpcError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const candidates = Array.isArray(rawCandidates) ? rawCandidates : []

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhum candidato NCM localizado na base oficial para os termos informados.',
          recommendation: null,
          alternatives: [],
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 7. Gatilho Condicional de Busca Web por informações complementares
    // Regra do projeto: busca na web SEMPRE que as informações internas disponíveis não forem suficientes
    const { isSufficient, reason: sufficiencyReason } = evaluateInformationSufficiency({
      productDescription,
      brand,
      model,
      additionalSpecs,
      candidates,
    })

    const webSources: WebSource[] = []
    let webContentSummary = ''

    if (!isSufficient) {
      try {
        const searchQuery = [brand, model, productDescription, 'specs datasheet']
          .filter(Boolean)
          .join(' ')
          .slice(0, 150)

        const searchResults = await searchWebTechnicalSpecs(searchQuery)
        for (const item of searchResults) {
          webSources.push(item)
        }

        if (webSources.length > 0) {
          webContentSummary = webSources
            .map((s, idx) => `[Fonte ${idx + 1}: ${s.title}] (${s.url})\n${s.snippet || ''}`)
            .join('\n\n')
        }
      } catch (webErr) {
        console.warn('Busca web complementar falhou sem interromper classificação:', webErr)
      }
    }

    // 8. Buscar provedores de IA ativos na tabela public.ai_providers ordenados por prioridade
    const { data: providers, error: provError } = await supabaseAdmin
      .from('ai_providers')
      .select(
        'id, provider_name, provider_type, model_id, api_key_secret_name, custom_endpoint, priority_order',
      )
      .eq('is_active', true)
      .order('priority_order', { ascending: true })

    if (provError || !providers || providers.length === 0) {
      console.error('Nenhum provedor de IA ativo encontrado em public.ai_providers:', provError)
      return new Response(
        JSON.stringify({
          error: 'Nenhum provedor de IA ativo configurado no sistema.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 9. Prompt de Raciocínio Aduaneiro NESH e TEC com RGI 1, RGI 3b e desempate
    const candidatesCatalogText = candidates
      .slice(0, topN)
      .map((c: any, index: number) => {
        const exText = c.ex ? ` [Ex-Tarifário: ${c.ex}]` : ' [Sem Ex]'
        const exDesc = c.ex_descricao ? ` | Ex-Desc: ${c.ex_descricao}` : ''
        return `${index + 1}. NCM: ${c.ncm}${exText}
   Descrição: ${c.ncm_descricao || c.source_text || ''}${exDesc}
   Alíquotas Banco: II=${c.ii_rate}%, IPI=${c.ipi_rate}%, PIS=${c.pis_rate}%, COFINS=${c.cofins_rate}%
   Scores: vector=${c.vector_score ?? 0}, combined=${c.combined_score ?? 0}`
      })
      .join('\n\n')

    const systemPrompt = `Você é o Auditor Fiscal Chefe e Perito em Classificação Aduaneira da My Way Video / My Way Business, especialista na Nomenclatura Comum do Mercosul (NCM), Tarifa Externa Comum (TEC), Notas Explicativas do Sistema Harmonizado (NESH) e Ex-Tarifários (GECEX).

SUA MISSÃO:
Analisar as especificações técnicas de um equipamento (audiovisual, broadcast, TI, ótica ou industrial) e determinar com precisão a classificação NCM e Ex-Tarifário mais adequada e juridicamente defensável.

REGRAS OBRIGATÓRIAS DE DECISÃO:
1. UNIVERSO FECHADO: Você DEVE ESCOLHER O NCM E EX RECOMENDADO E AS ALTERNATIVAS ESTRITAMENTE DENTRE A LISTA DE CANDIDATOS FORNECIDA ABAIXO. Nunca invente um NCM que não esteja na lista de candidatos.
2. REGRAS GERAIS DE INTERPRETAÇÃO (RGI):
   - RGI 1: Os títulos das Seções, Capítulos e Subcapítulos têm apenas valor indicativo. A classificação é determinada legalmente pelos textos das posições e das Notas de Seção e de Capítulo.
   - RGI 3(b): Para produtos mistos, compostos de matérias diferentes ou constituídos pela reunião de artigos diferentes (ex.: switcher com encoder integrado, câmera com processamento de rede), classifique pela matéria ou artigo que lhe confira a CARACTERÍSTICA ESSENCIAL.
   - RGI 6: A classificação nas subposições de uma mesma posição é determinada pelos textos dessas subposições.
3. DESEMPATE ENTRE CAPÍTULOS TÉCNICOS (84 vs 85 vs 90):
   - ATENÇÃO CRÍTICA: O Capítulo 84 é candidato pleno e representa grande parte da base industrial/TI (ex.: máquinas automáticas de processamento de dados 8471, impressoras, unidades de armazenamento, servidores, conversores industriais). NÃO o descarte em favor de 85 a menos que a função essencial seja telecomunicação/áudio/vídeo puro.
   - Capítulo 84: Máquinas, aparelhos e instrumentos mecânicos; máquinas automáticas para processamento de dados e suas unidades.
   - Capítulo 85: Máquinas, aparelhos e materiais elétricos, e suas partes; aparelhos de gravação ou de reprodução de som e de imagens em televisão (câmeras de estúdio, switchers, transmissores, conversores de sinal puro, amplificadores).
   - Capítulo 90: Instrumentos e aparelhos de óptica (lentes objetivas, filtros ópticos, microscópios), cinematografia e instrumentos de precisão.
4. EX-TARIFÁRIO E MENOR CARGA TRIBUTÁRIA DEFENSÁVEL:
   - Se o equipamento atender estritamente aos requisitos técnicos descritos no texto do Ex-Tarifário cadastrado, PRIORIZE o Ex-Tarifário, pois confere redução legítima de alíquota do Imposto de Importação (II) prevista em Resolução GECEX.
   - Se o produto não preencher 100% dos requisitos do Ex-Tarifário, escolha o código sem Ex ou o Ex genérico aplicável, justificando a razão.
5. RESPOSTA EXCLUSIVAMENTE EM JSON:
   Responda com um único bloco JSON válido, sem texto introdutório, no formato exato:
{
  "recommended_ncm": "string de 8 dígitos",
  "recommended_ex": "string com o número do Ex (ex: '001') ou '' se sem Ex",
  "justification": "Justificativa detalhada fundamentada nas RGI (RGI 1, RGI 3b ou RGI 6) e características do produto",
  "legal_basis": {
    "regime": "BK ou BIT ou GERAL",
    "notes": "referência legal ou justificativa sumária"
  },
  "confidence": "alta" | "media" | "baixa",
  "alternatives": [
    {
      "ncm": "8 dígitos",
      "ex": "Ex ou ''",
      "reason": "Motivo pelo qual esta alternativa pode ser considerada como plano de contingência fiscal"
    }
  ]
}`

    const userPrompt = `PRODUTO A CLASSIFICAR:
- Descrição: ${productDescription}
- Marca / Fabricante: ${brand || 'Não informada'}
- Modelo / P/N: ${model || 'Não informado'}
- Especificações adicionais: ${additionalSpecs || 'Nenhuma informada'}

AVALIAÇÃO DE SUFICIÊNCIA DAS INFORMAÇÕES:
- Informações internas completas: ${isSufficient ? 'SIM' : 'NÃO'} (${sufficiencyReason})
${webContentSummary ? `\nINFORMAÇÕES TÉCNICAS COMPLEMENTARES OBTIDAS VIA BUSCA WEB:\n${webContentSummary}\n` : ''}

LISTA DE CANDIDATOS NCM VÁLIDOS (Recuperados do Banco de Dados Oficial):
${candidatesCatalogText}

Escolha a melhor classificação com base nas regras NESH e retorne o JSON estruturado.`

    // 10. Chamada ao LLM com cascata de fallback
    let llmResponseJson: any = null
    let modelUsed = ''
    let lastLlmError = ''

    for (const provider of providers as LLMProviderConfig[]) {
      const apiKey = Deno.env.get(provider.api_key_secret_name) || ''
      if (!apiKey) {
        console.warn(
          `Chave secreta ${provider.api_key_secret_name} não configurada para provedor ${provider.provider_name}. Pulando.`,
        )
        continue
      }

      try {
        const rawContent = await invokeLLMWithTimeout(
          provider,
          apiKey,
          systemPrompt,
          userPrompt,
          25000,
        )

        const parsed = parseLLMJsonResponse(rawContent)
        if (parsed && parsed.recommended_ncm) {
          // Validar que o recommended_ncm existe nos candidatos recuperados
          const normRecNcm = normalizeNcm(parsed.recommended_ncm)
          const candidateMatch = candidates.find((c: any) => normalizeNcm(c.ncm) === normRecNcm)

          if (candidateMatch) {
            llmResponseJson = parsed
            modelUsed = `${provider.provider_name} (${provider.model_id})`
            break
          } else {
            console.warn(
              `LLM sugeriu NCM ${parsed.recommended_ncm} fora da lista de candidatos. Tentando fallback.`,
            )
          }
        }
      } catch (err: any) {
        lastLlmError = err?.message || String(err)
        console.warn(
          `Falha no provedor ${provider.provider_name} (${provider.model_id}):`,
          lastLlmError,
        )
      }
    }

    // Se nenhum LLM teve sucesso ou todos os provedores falharam, gerar erro 502
    if (!llmResponseJson) {
      console.error('Todos os provedores LLM falharam ao classificar NCM:', lastLlmError)
      return new Response(
        JSON.stringify({
          error: 'Falha na inferência dos provedores de IA ativos.',
          details: lastLlmError,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 11. Resolução estrita das alíquotas efetivas via public.imp_sim_tax_rates_effective
    // REGRA DO SISTEMA: O banco de dados sempre prevalece sobre as estimativas do LLM
    const recommendedNcmClean = normalizeNcm(llmResponseJson.recommended_ncm)
    const recommendedExClean = (llmResponseJson.recommended_ex || '').toString().trim()

    const resolvedPrimary = await resolveEffectiveTaxRate(
      supabaseAdmin,
      recommendedNcmClean,
      recommendedExClean,
    )

    // Se o ex sugerido não existir na view, buscar pelo NCM sem ex
    const primaryTaxRate =
      resolvedPrimary ||
      (await resolveEffectiveTaxRate(supabaseAdmin, recommendedNcmClean, '')) ||
      // Fallback para o candidato do search_ncm_candidates se a view não retornou
      candidates.find((c: any) => normalizeNcm(c.ncm) === recommendedNcmClean)

    if (!primaryTaxRate) {
      return new Response(
        JSON.stringify({
          error: `Inconsistência cadastral: NCM ${recommendedNcmClean} não encontrado na tabela de taxas.`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const iiRate = Number(primaryTaxRate.ii_efetivo ?? primaryTaxRate.ii_rate ?? 0)
    const ipiRate = Number(primaryTaxRate.ipi_rate ?? 0)
    const pisRate = Number(primaryTaxRate.pis_rate ?? 2.1)
    const cofinsRate = Number(primaryTaxRate.cofins_rate ?? 9.65)
    const totalTax = Number((iiRate + ipiRate + pisRate + cofinsRate).toFixed(2))

    const hasEx = Boolean(
      primaryTaxRate.has_ex_tarifario || (primaryTaxRate.ex && primaryTaxRate.ex !== ''),
    )

    const exDetails = hasEx
      ? {
          descricao: primaryTaxRate.ex_descricao || null,
          resolucao: primaryTaxRate.ex_resolucao || null,
          data_fim: primaryTaxRate.ex_data_fim || null,
        }
      : null

    // 12. Resolver alíquotas para alternativas
    const resolvedAlternatives: any[] = []
    const rawAlternatives = Array.isArray(llmResponseJson.alternatives)
      ? llmResponseJson.alternatives
      : []

    for (const alt of rawAlternatives) {
      const altNcmClean = normalizeNcm(alt.ncm || '')
      if (!altNcmClean || altNcmClean === recommendedNcmClean) continue

      const altExClean = (alt.ex || '').toString().trim()
      const altTaxRate =
        (await resolveEffectiveTaxRate(supabaseAdmin, altNcmClean, altExClean)) ||
        (await resolveEffectiveTaxRate(supabaseAdmin, altNcmClean, '')) ||
        candidates.find((c: any) => normalizeNcm(c.ncm) === altNcmClean)

      if (altTaxRate) {
        const altIi = Number(altTaxRate.ii_efetivo ?? altTaxRate.ii_rate ?? 0)
        const altIpi = Number(altTaxRate.ipi_rate ?? 0)
        const altPis = Number(altTaxRate.pis_rate ?? 2.1)
        const altCofins = Number(altTaxRate.cofins_rate ?? 9.65)
        const altTotal = Number((altIi + altIpi + altPis + altCofins).toFixed(2))

        resolvedAlternatives.push({
          ncm: altNcmClean,
          ex: altTaxRate.ex || altExClean,
          description: altTaxRate.ncm_descricao || altTaxRate.source_text || '',
          ii: altIi,
          ipi: altIpi,
          pis: altPis,
          cofins: altCofins,
          total_tax: altTotal,
          has_ex_tarifario: Boolean(altTaxRate.has_ex_tarifario || altTaxRate.ex),
          reason: alt.reason || 'Posição fiscal alternativa aplicável.',
        })
      }
    }

    // Se o LLM não deu alternativas suficientes, preencher com os melhores candidatos da lista
    if (resolvedAlternatives.length === 0) {
      for (const cand of candidates) {
        const cNcm = normalizeNcm(cand.ncm)
        if (cNcm !== recommendedNcmClean && resolvedAlternatives.length < 3) {
          const cIi = Number(cand.ii_rate ?? 0)
          const cIpi = Number(cand.ipi_rate ?? 0)
          const cPis = Number(cand.pis_rate ?? 2.1)
          const cCofins = Number(cand.cofins_rate ?? 9.65)
          resolvedAlternatives.push({
            ncm: cNcm,
            ex: cand.ex || '',
            description: cand.ncm_descricao || cand.source_text || '',
            ii: cIi,
            ipi: cIpi,
            pis: cPis,
            cofins: cCofins,
            total_tax: Number((cIi + cIpi + cPis + cCofins).toFixed(2)),
            has_ex_tarifario: Boolean(cand.has_ex_tarifario),
            reason: 'Candidato alternativo com alta similaridade semântica na base oficial.',
          })
        }
      }
    }

    const executionTimeMs = Date.now() - startTime

    const recommendationObject = {
      ncm: recommendedNcmClean,
      ex: primaryTaxRate.ex || recommendedExClean,
      description: primaryTaxRate.ncm_descricao || primaryTaxRate.source_text || '',
      ii: iiRate,
      ipi: ipiRate,
      pis: pisRate,
      cofins: cofinsRate,
      total_tax: totalTax,
      has_ex_tarifario: hasEx,
      justification:
        llmResponseJson.justification ||
        'Classificação fundamentada na RGI 1 e notas explicativas da TEC.',
      legal_basis: llmResponseJson.legal_basis || primaryTaxRate.legal_basis || {},
      ex_details: exDetails,
    }

    // 13. Gravação no log de auditoria (imp_sim_ncm_classification_log)
    let auditId: string | null = null
    if (saveLog) {
      try {
        const { data: logEntry, error: logError } = await supabaseAdmin
          .from('imp_sim_ncm_classification_log')
          .insert({
            input_description: productDescription,
            agent_suggestion: {
              recommendation: recommendationObject,
              alternatives: resolvedAlternatives,
              confidence: llmResponseJson.confidence || 'media',
              sufficient_info: isSufficient,
              model_used: modelUsed,
              brand,
              model,
              additional_specs: additionalSpecs,
            },
            final_choice_ncm: recommendedNcmClean,
            final_choice_ex: primaryTaxRate.ex || recommendedExClean,
            confirmed_by: user.id,
            status: 'pendente',
            product_id: productId,
            imp_sim_product_id: impSimProductId,
            audit_links: webSources,
            knowledge_base_version: '2.0',
            execution_time_ms: executionTimeMs,
          })
          .select('id')
          .single()

        if (logError) {
          console.warn('Erro ao gravar imp_sim_ncm_classification_log (não fatal):', logError)
        } else if (logEntry) {
          auditId = logEntry.id
        }
      } catch (logEx) {
        console.warn('Exceção ao gravar log de auditoria NCM:', logEx)
      }
    }

    // 14. Resposta JSON completa da Fase 2
    const responsePayload = {
      success: true,
      audit_id: auditId,
      recommendation: recommendationObject,
      alternatives: resolvedAlternatives,
      confidence: (llmResponseJson.confidence || 'media').toLowerCase(),
      sufficient_info: isSufficient,
      web_sources: webSources,
      model_used: modelUsed,
      candidates_count: candidates.length,
      execution_time_ms: executionTimeMs,
      timestamp: new Date().toISOString(),
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro não tratado na edge function classify-ncm:', error)
    return new Response(
      JSON.stringify({
        error: 'Erro interno ao processar classificação fiscal.',
        details: error?.message || String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function normalizeNcm(val: any): string {
  if (!val) return ''
  return String(val).replace(/\D/g, '')
}

/**
 * Avalia se as informações internas fornecidas são suficientes para classificação aduaneira precisa.
 * Gatilho condicional da regra do projeto.
 */
function evaluateInformationSufficiency(params: {
  productDescription: string
  brand: string
  model: string
  additionalSpecs: string
  candidates: any[]
}): { isSufficient: boolean; reason: string } {
  const desc = params.productDescription.trim()

  // 1. Descrição excessivamente curta (< 20 caracteres)
  if (desc.length < 20) {
    return {
      isSufficient: false,
      reason: 'Descrição muito curta para determinação inequívoca da função essencial.',
    }
  }

  // 2. Falta de marca ou modelo para produtos que necessitam de datasheet
  const hasBrandOrModel = Boolean(params.brand || params.model)
  const technicalKeywords = [
    'sdi',
    'hdmi',
    '4k',
    'ptz',
    'sensor',
    'cmos',
    'optical',
    'zoom',
    'resolução',
    'encoder',
    'decoder',
    'streaming',
    'ethernet',
    'poe',
    'fps',
    'frame',
    'switch',
    'lente',
    'mount',
    'dr',
    'iso',
    'lux',
    't-stop',
    'f-stop',
    'matrix',
    'transceiver',
    'potência',
    'tensao',
    'w',
    'v',
    'kw',
    'khz',
    'mhz',
    'ghz',
    'capacidade',
  ]

  const lowerDesc = `${desc} ${params.additionalSpecs}`.toLowerCase()
  const matchedKeywords = technicalKeywords.filter((kw) => lowerDesc.includes(kw))

  if (matchedKeywords.length === 0 && !hasBrandOrModel) {
    return {
      isSufficient: false,
      reason: 'Ausência de termos técnicos qualificadores e falta de marca/modelo.',
    }
  }

  // 3. Candidatos do banco com score vetorial ou combinado muito baixo
  const topCandidate = params.candidates[0]
  if (topCandidate) {
    const topScore = Number(topCandidate.combined_score ?? topCandidate.text_score ?? 0)
    if (topScore < 0.15) {
      return {
        isSufficient: false,
        reason: 'Candidatos na base interna possuem baixa similaridade com o texto de entrada.',
      }
    }
  }

  return {
    isSufficient: true,
    reason: 'Informações suficientes fornecidas nos parâmetros internos.',
  }
}

/**
 * Busca web complementar para especificações técnicas e datasheets (DuckDuckGo Lite ou Firecrawl)
 */
async function searchWebTechnicalSpecs(query: string): Promise<WebSource[]> {
  const sources: WebSource[] = []

  // Tentativa 1: Firecrawl se tiver chave configurada
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY') || ''
  if (firecrawlKey) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 3,
        }),
      })

      if (res.ok) {
        const json = await res.json()
        const items = json?.data || []
        for (const it of items) {
          if (it.url) {
            sources.push({
              title: it.title || it.url,
              url: it.url,
              snippet: it.description || it.markdown?.slice(0, 300) || '',
            })
          }
        }
        if (sources.length > 0) return sources
      }
    } catch (e) {
      console.warn('Firecrawl search failed:', e)
    }
  }

  // Tentativa 2: DuckDuckGo HTML Lite (sem necessidade de chave de API externa)
  try {
    const encoded = encodeURIComponent(query)
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    if (res.ok) {
      const html = await res.text()
      // Regex simples para extrair links e snippets dos resultados DuckDuckGo Lite
      const linkRegex = /<a[^>]+class="result__snippet"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi
      const titleRegex = /<a[^>]+class="result__url"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi

      let match: RegExpExecArray | null
      let count = 0

      // Match dos blocos de resultados
      const resultBlocks = html.split('class="result__body"')
      for (let i = 1; i < resultBlocks.length && count < 3; i++) {
        const block = resultBlocks[i]
        const urlMatch = block.match(/href="([^"]+)"/)
        const snippetMatch = block.match(/class="result__snippet"[^>]*>(.*?)<\/a>/)
        const titleMatch = block.match(/class="result__title"[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>/)

        if (urlMatch && (snippetMatch || titleMatch)) {
          let rawUrl = urlMatch[1]
          // DuckDuckGo encapsula em //duckduckgo.com/l/?uddg=...
          if (rawUrl.includes('uddg=')) {
            const uddg = rawUrl.split('uddg=')[1]?.split('&')[0]
            if (uddg) rawUrl = decodeURIComponent(uddg)
          }

          const cleanTitle = (titleMatch ? titleMatch[1] : rawUrl).replace(/<[^>]+>/g, '').trim()
          const cleanSnippet = (snippetMatch ? snippetMatch[1] : '').replace(/<[^>]+>/g, '').trim()

          if (rawUrl.startsWith('http')) {
            sources.push({
              title: cleanTitle || 'Documentação Técnica',
              url: rawUrl,
              snippet: cleanSnippet,
            })
            count++
          }
        }
      }
    }
  } catch (ddgErr) {
    console.warn('DuckDuckGo search error:', ddgErr)
  }

  return sources
}

/**
 * Consulta a view pública public.imp_sim_tax_rates_effective
 */
async function resolveEffectiveTaxRate(
  supabaseAdmin: any,
  ncm: string,
  ex: string,
): Promise<any | null> {
  const normNcm = normalizeNcm(ncm)
  if (!normNcm) return null

  let query = supabaseAdmin.from('imp_sim_tax_rates_effective').select('*').eq('ncm', normNcm)

  if (ex && ex.trim() !== '') {
    query = query.eq('ex', ex.trim())
  } else {
    // Tenta primeiro sem ex
    query = query.or('ex.is.null,ex.eq.')
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error || !data) return null
  return data
}

/**
 * Invoca um modelo de IA com timeout e tratamento unificado
 */
async function invokeLLMWithTimeout(
  provider: LLMProviderConfig,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const provType = (provider.provider_type || provider.provider_name || '').toLowerCase()

    if (provType.includes('deepseek')) {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: provider.model_id || 'deepseek-chat',
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`DeepSeek API (${res.status}): ${await res.text()}`)
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    }

    if (provType.includes('claude') || provType.includes('anthropic')) {
      const res = await fetch(provider.custom_endpoint || 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.model_id || 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          temperature: 0.1,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Anthropic API (${res.status}): ${await res.text()}`)
      const data = await res.json()
      return data.content?.[0]?.text || ''
    }

    // Default: OpenAI compatível
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model_id || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`OpenAI API (${res.status}): ${await res.text()}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Converte resposta textual do LLM em objeto JSON estruturado
 */
function parseLLMJsonResponse(rawText: string): any {
  if (!rawText) return null
  const clean = rawText.trim()

  // Se já for JSON direto
  try {
    return JSON.parse(clean)
  } catch (_e) {
    // Tentar localizar bloco {...}
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(clean.substring(start, end + 1))
      } catch (_e2) {
        return null
      }
    }
    return null
  }
}

/**
 * Gera embedding único usando OpenAI text-embedding-3-small
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenAI Embedding error: ${await res.text()}`)
  }

  const json = await res.json()
  return json.data[0].embedding
}
