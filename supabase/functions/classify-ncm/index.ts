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

interface ExQualifiers {
  signalType: 'digital' | 'analog' | null
  frequencyRanges: string[]
  isSingularItem: boolean
  singularComponentType: string | null
  materialRequirements: string[]
  purposeRequirements: string[]
  formatPortability: string[]
}

interface ExConditionComparison {
  name: string
  productValue: string
  exRequirement: string
  status: 'ATENDE' | 'NÃO ATENDE' | 'NÃO COMPROVADO'
  reason?: string
}

interface ExChecklistResult {
  passed: boolean
  comparisons: ExConditionComparison[]
  vetoReason?: string
  missingInformation: string[]
  needsWebSearch: boolean
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

  // Cliente admin com service_role para ler tabelas protegidas (ai_providers, efetivas, logs)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  let callerUserId: string | null = null

  // Se a requisição veio com a chave de serviço (ex: chamadas internas/M2M entre sistemas com a mesma infraestrutura)
  if (jwt === serviceRoleKey) {
    const { data: defaultUser } = await supabaseAdmin
      .from('customers')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()
    callerUserId = defaultUser?.user_id || null
  } else {
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser(jwt)

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: 'JWT inválido ou expirado.',
          details: userError?.message,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    callerUserId = user.id
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
  const topN = Math.max(8, Math.min(Number(body.top_n) || 15, 30))
  const saveLog = body.save_log !== false
  const productId = body.product_id || null
  const impSimProductId = body.imp_sim_product_id || null

  try {
    // 4. Construir Assinatura Enxuta do Produto
    const leanSignature = buildLeanProductSignature({
      brand,
      model,
      description: productDescription,
    })

    // 5. Análise de Composição Universal (Sistemas / Conjuntos / Kits - RGI 3b/3c)
    // Regra vinculante: componentes devem ser citados TEXTUALMENTE na descrição/especificações do produto (verbatim).
    // Componente que não aparece explicitamente no texto não pode ser afirmado.
    let combinedProductText = [productDescription, brand, model, additionalSpecs]
      .filter(Boolean)
      .join(' ')
    let compositionAnalysis = analyzeProductComposition(combinedProductText)

    // 6. GATILHO CONDICIONAL DE BUSCA WEB (ANTES DA DECISÃO)
    // Se a descrição interna não permitir identificar a composição (se for kit com composição indefinida)
    // ou se as specs internas forem insuficientes para qualificar aspectos técnicos,
    // acionar a busca na web OBRIGATORIAMENTE antes de decidir (gatilho condicional, não opcional).
    const webSources: WebSource[] = []
    let webContentSummary = ''

    let sufficiencyCheck = evaluateInformationSufficiency({
      productDescription,
      brand,
      model,
      additionalSpecs,
      compositionAnalysis,
    })

    if (!sufficiencyCheck.isSufficient) {
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

          // Reavaliar composição e suficiência enriquecidas pelo conteúdo web
          combinedProductText = [
            productDescription,
            brand,
            model,
            additionalSpecs,
            webContentSummary,
          ]
            .filter(Boolean)
            .join(' ')
          compositionAnalysis = analyzeProductComposition(combinedProductText)
          sufficiencyCheck = evaluateInformationSufficiency({
            productDescription,
            brand,
            model,
            additionalSpecs,
            compositionAnalysis,
          })
        }
      } catch (webErr) {
        console.warn('Busca web complementar falhou sem interromper classificação:', webErr)
      }
    }

    const fullTechnicalProfile = [combinedProductText, webContentSummary].filter(Boolean).join('\n')

    // 7. RECUPERAÇÃO ORIENTADA POR SETOR (SEM LISTAS HARDCODED)
    // Mapeamento semântico da assinatura do produto para sua família de posições no banco,
    // garantindo diversidade de posições adjacentes e priorização da família correspondente à assinatura
    const openAiKey = Deno.env.get('OPENAI_API_KEY') || ''
    let queryEmbedding: number[] | null = null
    if (openAiKey) {
      try {
        // Enriquecer embedding da consulta com a assinatura e componentes verbatim
        const embeddingInput = [leanSignature, compositionAnalysis.detectedComponents.join(' ')]
          .filter(Boolean)
          .join(' ')

        queryEmbedding = await generateEmbedding(embeddingInput, openAiKey)
      } catch (embErr) {
        console.warn('Falha ao gerar embedding para assinatura enxuta NCM:', embErr)
      }
    }

    let candidates = await retrieveSectorOrientedCandidates({
      supabaseAdmin,
      query: leanSignature,
      queryEmbedding,
      fullTechnicalProfile,
      detectedComponents: compositionAnalysis.detectedComponents,
      topN,
    })

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

    // 9. PROMPT UNIVERSAL COM ANÁLISE DE COMPOSIÇÃO (RGI 3b / 3c) E RESTRIÇÃO DE EX
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

    const systemPrompt = `Você é o Auditor Fiscal Chefe e Perito em Classificação Aduaneira da My Way Video / My Way Business, especialista na Nomenclatura Comum do Mercosul (NCM), Tarifa Externa Comum (TEC), Notas Explicativas do Sistema Harmonizado (NESH), Regras Gerais para Interpretação (RGI) e Ex-Tarifários (GECEX).

SUA MISSÃO:
Analisar as especificações técnicas de qualquer produto ou sistema e determinar a classificação NCM e Ex-Tarifário rigorosamente correta e juridicamente defensável.

METODOLOGIA OBRIGATÓRIA UNIVERSAL (PRINCÍPIOS GENÉRICOS):

1. ANÁLISE DE COMPOSIÇÃO UNIVERSAL (SISTEMAS / CONJUNTOS / KITS - RGI 3b / 3c):
   Para QUALQUER produto reconhecido como sistema, conjunto, sortido ou kit (produtos compostos por múltiplos elementos que operam em conjunto, como transmissor + receptor, console + fonte, etc.):
   (a) EXIGÊNCIA VERBATIM: Os componentes listados DEVEM ser citados TEXTUALMENTE na descrição/especificações do produto. Componente que não aparece explicitamente no texto NÃO pode ser afirmado (ex: termos como "camera-mount" indicam montagem/suporte, NUNCA a presença de câmera).
   (b) FUNÇÃO ESSENCIAL: Enunciar a função essencial do conjunto como um todo (caráter essencial da RGI 3b) e classificar na família de posições que reflete essa função essencial.
   (c) PROIBIÇÃO ABSOLUTA DE EX SINGULAR PARA CONJUNTO: NUNCA aplique a um conjunto a descrição de um Ex-Tarifário que descreve um item singular/isolado, SALVO se houver fundamento explícito demonstrando que o Ex contempla o conjunto inteiro.

2. METODOLOGIA FUNÇÃO-PRIMEIRO (FUNCTION-FIRST) E PRIORIZAÇÃO DA POSIÇÃO ESPECÍFICA:
   - Antes de escolher qualquer NCM, enuncie o que o produto É em sua essência funcional.
   - Posições específicas têm prioridade absoluta sobre posições residuais/genéricas (RGI 3a).
   - Não classifique em posições genéricas de telecomunicação de dados produtos que possuem posição própria correspondente à sua função específica de áudio, imagem ou medição.
   - Aparelhos de comando/controle, consoles e joysticks eletrônicos pertencem ao Capítulo 85 (8543, 8529, 8537) e JAMAIS a máquinas mecânicas de elevação, pontes rolantes, gruas ou guindastes do Capítulo 84 (8426, 8428).

3. CONDICIONALIDADES RESTRITIVAS DE EX-TARIFÁRIOS:
   - Os Ex-Tarifários são normas de exceção tributária de interpretação estrita (Art. 111 do CTN).
   - Se o texto do Ex exige "sinal DIGITAL" e o produto opera com sinal ANALÓGICO (ou vice-versa), o Ex NÃO PODE ser aplicado.
   - Cada valor técnico do produto confrontado com o Ex deve ser copiado LITERALMENTE das especificações. Valor não comprovado ou contraditório impede a concessão do Ex.

4. UNIVERSO DE CANDIDATOS E FORMATO DE SAÍDA:
   - Escolha o recommended_ncm e recommended_ex EXCLUSIVAMENTE a partir da lista de candidatos fornecida.
   - Responda OBRIGATORIAMENTE em JSON válido sem texto externo, no formato exato:
{
  "is_kit_or_system": boolean,
  "components_list": ["componente verbatim 1", "componente verbatim 2"],
  "essential_function": "Enunciação clara e precisa da função essencial do produto ou conjunto",
  "recommended_ncm": "8 dígitos",
  "recommended_ex": "número do Ex (ex: '019') ou '' se sem Ex",
  "justification": "Justificativa detalhada com análise de composição (RGI 3b), confronto de condições e notas da TEC",
  "legal_basis": {
    "regime": "BK ou BIT ou GERAL",
    "notes": "referência legal ou justificativa sumária"
  },
  "confidence": "alta" | "media" | "baixa",
  "alternatives": [
    {
      "ncm": "8 dígitos",
      "ex": "Ex ou ''",
      "reason": "Motivo fiscal e técnico funcionalmente plausível"
    }
  ]
}`

    const userPrompt = `PRODUTO A CLASSIFICAR:
- Descrição: ${productDescription}
- Marca / Fabricante: ${brand || 'Não informada'}
- Modelo / P/N: ${model || 'Não informado'}
- Especificações adicionais: ${additionalSpecs || 'Nenhuma informada'}

ANÁLISE PRÉVIA DE COMPOSIÇÃO:
- É reconhecido como Sistema / Conjunto / Kit: ${compositionAnalysis.isKit ? 'SIM' : 'NÃO'}
- Componentes identificados: ${compositionAnalysis.detectedComponents.join(', ') || 'Item singular'}

AVALIAÇÃO DE SUFICIÊNCIA DAS INFORMAÇÕES:
- Informações suficientes internamente: ${sufficiencyCheck.isSufficient ? 'SIM' : 'NÃO'} (${sufficiencyCheck.reason})
${webContentSummary ? `\nINFORMAÇÕES TÉCNICAS COMPLEMENTARES OBTIDAS VIA BUSCA WEB:\n${webContentSummary}\n` : ''}

LISTA DE CANDIDATOS NCM VÁLIDOS (Recuperados do Banco de Dados Oficial):
${candidatesCatalogText}

Avalie todos os candidatos e forneça o JSON estruturado conforme o protocolo aduaneiro.`

    // 10. Chamada ao LLM com cascata de fallback
    let llmResponseJson: any = null
    let modelUsed = ''
    let lastLlmError = ''

    for (const provider of providers as LLMProviderConfig[]) {
      const apiKey = Deno.env.get(provider.api_key_secret_name) || ''
      if (!apiKey) continue

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
        console.warn(`Falha no provedor ${provider.provider_name}:`, lastLlmError)
      }
    }

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

    // 11. CÓDIGO DETERMINÍSTICO — CHECKLIST UNIVERSAL DE CONDIÇÕES RESTRITIVAS DO EX
    // Extração em código de qualificadores do Ex e confrontação com o perfil técnico do produto.
    // Formato obrigatório na justificativa: "produto: X → Ex exige: Y → ATENDE/NÃO ATENDE"
    // Se qualquer condição não for atendida, o Ex é VETADO AUTOMATICAMENTE em código.
    const initialRecNcm = normalizeNcm(llmResponseJson.recommended_ncm)
    let initialRecEx = (llmResponseJson.recommended_ex || '').toString().trim()

    let activeExCandidate = candidates.find(
      (c: any) => normalizeNcm(c.ncm) === initialRecNcm && (c.ex || '').trim() === initialRecEx,
    )

    // Se o candidato tiver Ex-Tarifário, executar checklist de validação em código
    let checklistLog: ExChecklistResult = {
      passed: true,
      comparisons: [],
      missingInformation: [],
      needsWebSearch: false,
    }

    let checklistFormattedReport = ''
    let exVetoApplied = false

    if (initialRecEx && activeExCandidate?.ex_descricao) {
      // 11.A Se specs internas forem insuficientes para verificar uma condição, acionar busca na web antes de decidir
      checklistLog = evaluateExChecklistAgainstProduct({
        exDescription: activeExCandidate.ex_descricao,
        productText: fullTechnicalProfile,
        isKit: compositionAnalysis.isKit,
        detectedComponents: compositionAnalysis.detectedComponents,
      })

      // Se precisava de busca na web e ainda não tinha sido feita, acionar agora
      if (checklistLog.needsWebSearch && webSources.length === 0) {
        try {
          const targetedQuery = [brand, model, activeExCandidate.ex_descricao.slice(0, 60)]
            .filter(Boolean)
            .join(' ')
          const addlSources = await searchWebTechnicalSpecs(targetedQuery)
          for (const s of addlSources) webSources.push(s)
          if (addlSources.length > 0) {
            const addlSummary = addlSources
              .map(
                (s, idx) =>
                  `[Fonte Web Adicional ${idx + 1}: ${s.title}] (${s.url})\n${s.snippet || ''}`,
              )
              .join('\n\n')
            webContentSummary = [webContentSummary, addlSummary].filter(Boolean).join('\n\n')
            // Reavalia com as novas informações
            checklistLog = evaluateExChecklistAgainstProduct({
              exDescription: activeExCandidate.ex_descricao,
              productText: [fullTechnicalProfile, addlSummary].join('\n'),
              isKit: compositionAnalysis.isKit,
              detectedComponents: compositionAnalysis.detectedComponents,
            })
          }
        } catch (searchErr) {
          console.warn('Busca web complementar de desempate do checklist falhou:', searchErr)
        }
      }

      // Montar a justificativa formatada no padrão exigido:
      // "produto: X → Ex exige: Y → ATENDE/NÃO ATENDE"
      if (checklistLog.comparisons.length > 0) {
        checklistFormattedReport = checklistLog.comparisons
          .map(
            (c) =>
              `• produto: ${c.productValue} → Ex exige: ${c.exRequirement} → ${c.status}${c.reason ? ` (${c.reason})` : ''}`,
          )
          .join('\n')
      }

      // VETO AUTOMÁTICO EM CÓDIGO se qualquer condição não for atendida
      if (!checklistLog.passed) {
        exVetoApplied = true
        console.warn(
          `[Checklist Ex-Tarifário Veto Automático]: O Ex ${initialRecEx} da posição ${initialRecNcm} foi vetado. Motivo: ${checklistLog.vetoReason}`,
        )

        // Remover o Ex da recomendação e rebaixar para a alíquota base ou alternativa adequada
        initialRecEx = ''
        llmResponseJson.recommended_ex = ''
      }
    }

    // 12. SEGUNDA PASSADA DE AUDITORIA LLM
    // Se a 1ª passada recomendou posição genérica residual (ex: 85176291 ou similar) quando há candidatos
    // específicos de setor ou componentes no catálogo de candidatos, alertar na auditoria
    const initialRecommendation = {
      recommended_ncm: initialRecNcm,
      recommended_ex: (llmResponseJson.recommended_ex || '').toString().trim(),
      essential_function: llmResponseJson.essential_function || '',
      justification: llmResponseJson.justification || '',
    }

    let auditVerdict: {
      action: 'APROVA' | 'VETA'
      essential_function: string
      corrected_ncm?: string
      corrected_ex?: string
      correction_reason?: string
      audit_critique: string
      override_applied?: boolean
      override_reason?: string
    } = {
      action: 'APROVA',
      essential_function: initialRecommendation.essential_function,
      audit_critique: 'Aprovado pelo perito auditor.',
    }

    // Se o código determinístico vetou o Ex, registrar o status no initialRecommendation
    if (exVetoApplied) {
      initialRecommendation.recommended_ex = ''
    }

    try {
      const auditorSystemPrompt = `Você é o Auditor Revisor Sênior da Receita Federal e Aduana, atuando como segunda instância independente para homologar ou vetar a recomendação de classificação NCM.

PROTOCOLO OBRIGATÓRIO DE AUDITORIA (PRINCÍPIOS GENÉRICOS UNIVERSAIS):
1. ENUNCIAÇÃO DA FUNÇÃO ESSENCIAL: declare a função essencial que confere caráter essencial ao produto ou conjunto global (RGI 1 e RGI 3b).
2. O VETO AO EX-TARIFÁRIO NÃO ENCERRA A ANÁLISE:
   - Vetar um Ex-Tarifário NÃO significa manter automaticamente o NCM base residual.
   - O auditor DEVE OBRIGATORIAMENTE re-confrontar a descrição oficial da posição/subposição do NCM base com a função essencial do produto (após a análise de composição corrigida).
   - Se a descrição da posição base também NÃO corresponder com exatidão à função essencial da mercadoria (por exemplo, classificar aparelho de transmissão ou captura de som em posições residuais de telecomunicação de dados, ou aparelho eletrônico em máquinas mecânicas), a recomendação DEVE MIGRAR (action: "VETA") para a família de posições correta entre os candidatos disponíveis, com justificativa detalhada registrada.
3. CONJUNTOS / SISTEMAS: NUNCA homologue Ex-Tarifário singular individual para conjuntos ou sistemas de múltiplos elementos funcionais.
4. CONDIÇÕES TÉCNICAS E COERÊNCIA: NUNCA homologue Ex cujas exigências sejam incompatíveis com os valores literais das especificações do produto (ex: Ex de sinal digital para transmissão analógica, faixas de frequência incompatíveis).
5. CLASSIFICAÇÃO SETORIAL CORRETA: Aparelhos e consoles de controle pertencem ao setor eletroeletrônico (Capítulo 85) e nunca a máquinas de movimentação/elevação mecânicas (Capítulo 84).

RESPOSTA OBRIGATÓRIA EM JSON:
{
  "essential_function": "Função essencial do produto/conjunto",
  "action": "APROVA" ou "VETA",
  "audit_critique": "Análise crítica do confronto entre a descrição do NCM e a função essencial",
  "corrected_ncm": "8 dígitos se VETA",
  "corrected_ex": "Ex corrigido ou ''",
  "correction_reason": "Fundamentação legal da migração de posição ou do veto"
}`

      const auditorUserPrompt = `PRODUTO ANALISADO:
- Marca: ${brand || 'Não informada'} | Modelo: ${model || 'Não informado'}
- Descrição: ${productDescription}
- Assinatura: ${leanSignature}
- É Conjunto/Sistema: ${compositionAnalysis.isKit ? 'SIM' : 'NÃO'} (Componentes verbatim: ${compositionAnalysis.detectedComponents.join(', ') || 'Nenhum identificado textualmente'})
- Especificações: ${additionalSpecs || 'N/A'}

RECOMENDAÇÃO DA 1ª PASSADA:
- Função Enunciada: ${initialRecommendation.essential_function}
- NCM: ${initialRecommendation.recommended_ncm} | Ex: ${initialRecommendation.recommended_ex || 'Nenhum'}
- Status do Checklist em Código: ${checklistLog.passed ? 'ATENDEU' : 'VETADO PELO CÓDIGO'}
${checklistFormattedReport ? `\nCHECKLIST DE CONDIÇÕES DO EX:\n${checklistFormattedReport}\n` : ''}

ATENÇÃO AUDITOR:
1. Se o Ex foi vetado ou se a posição base recomendada (${initialRecommendation.recommended_ncm}) não descreve a função essencial da mercadoria com exatidão e existem posições específicas de família no catálogo abaixo (ex: aparelho funcionalmente de áudio vs posição genérica de telecomunicação, ou controle eletrônico vs máquinas), VETE (action: "VETA") e MIGRE para o NCM mais adequado entre os candidatos disponíveis.
2. VETAR O EX NÃO SIGNIFICA MANTER O NCM RESIDUAL: Você DEVE verificar se a posição base 4/6/8 dígitos faz sentido para o produto. Se não fizer, altere o NCM em "corrected_ncm".

LISTA DE CANDIDATOS VÁLIDOS:
${candidatesCatalogText}`

      for (const provider of providers as LLMProviderConfig[]) {
        const apiKey = Deno.env.get(provider.api_key_secret_name) || ''
        if (!apiKey) continue

        const auditRawContent = await invokeLLMWithTimeout(
          provider,
          apiKey,
          auditorSystemPrompt,
          auditorUserPrompt,
          20000,
        )
        const parsedAudit = parseLLMJsonResponse(auditRawContent)
        if (parsedAudit && (parsedAudit.action === 'APROVA' || parsedAudit.action === 'VETA')) {
          auditVerdict = {
            action: parsedAudit.action,
            essential_function:
              parsedAudit.essential_function || initialRecommendation.essential_function,
            corrected_ncm: parsedAudit.corrected_ncm
              ? normalizeNcm(parsedAudit.corrected_ncm)
              : undefined,
            corrected_ex: (parsedAudit.corrected_ex || '').toString().trim(),
            correction_reason: parsedAudit.correction_reason || '',
            audit_critique: parsedAudit.audit_critique || '',
          }
          break
        }
      }

      // Guarda universal: se o auditor tentar aplicar um Ex vetado pelo checklist determinístico, rejeitar
      if (auditVerdict.action === 'VETA' && auditVerdict.corrected_ex) {
        const candidateMatch = candidates.find(
          (c: any) =>
            normalizeNcm(c.ncm) === normalizeNcm(auditVerdict.corrected_ncm) &&
            (c.ex || '').trim() === auditVerdict.corrected_ex,
        )
        if (candidateMatch?.ex_descricao) {
          const auditCheck = evaluateExChecklistAgainstProduct({
            exDescription: candidateMatch.ex_descricao,
            productText: fullTechnicalProfile,
            isKit: compositionAnalysis.isKit,
            detectedComponents: compositionAnalysis.detectedComponents,
          })
          if (!auditCheck.passed) {
            console.warn(
              `[Checklist Ex] Auditor tentou corrigir para Ex ${auditVerdict.corrected_ex} que NÃO atende às condições. Removendo Ex da correção.`,
            )
            auditVerdict.corrected_ex = ''
          }
        }
      }

      // Aplicação da decisão do auditor (se legítima)
      if (auditVerdict.action === 'VETA' && auditVerdict.corrected_ncm) {
        const correctedDigits = normalizeNcm(auditVerdict.corrected_ncm)
        const candidateMatch = candidates.find((c: any) => normalizeNcm(c.ncm) === correctedDigits)
        if (candidateMatch) {
          llmResponseJson.recommended_ncm = correctedDigits
          llmResponseJson.recommended_ex = auditVerdict.corrected_ex || ''
          llmResponseJson.justification = `[Revisão de Auditoria Aduaneira: Veto e Correção Homologados]\n${auditVerdict.correction_reason || auditVerdict.audit_critique}\n\nFundamentação Complementar: ${llmResponseJson.justification}`
        }
      }
    } catch (auditErr) {
      console.warn('Falha na segunda passada de auditoria:', auditErr)
    }

    // 13. Resolução estrita das alíquotas efetivas via public.imp_sim_tax_rates_effective
    const recommendedNcmClean = normalizeNcm(llmResponseJson.recommended_ncm)
    const recommendedExClean = (llmResponseJson.recommended_ex || '').toString().trim()

    const resolvedPrimary = await resolveEffectiveTaxRate(
      supabaseAdmin,
      recommendedNcmClean,
      recommendedExClean,
    )

    const primaryTaxRate =
      resolvedPrimary ||
      (await resolveEffectiveTaxRate(supabaseAdmin, recommendedNcmClean, '')) ||
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

    // 14. Resolver alíquotas para alternativas
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
          description:
            altTaxRate.ex_descricao || altTaxRate.ncm_descricao || altTaxRate.source_text || '',
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
            description: cand.ex_descricao || cand.ncm_descricao || cand.source_text || '',
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

    const primaryDescription =
      primaryTaxRate.ex_descricao ||
      primaryTaxRate.ncm_descricao ||
      primaryTaxRate.source_text ||
      ''

    // Montar a justificativa final contendo a análise de composição e o checklist comparativo
    let finalJustification = llmResponseJson.justification || ''
    if (compositionAnalysis.isKit) {
      const compText = `[Análise de Composição RGI 3b/3c]: Produto identificado como conjunto/sistema (${compositionAnalysis.detectedComponents.join(', ')}). Enquadramento determinado pela função essencial do conjunto global.`
      if (!finalJustification.includes('[Análise de Composição')) {
        finalJustification = `${compText}\n\n${finalJustification}`
      }
    }

    if (checklistFormattedReport) {
      const reportHeader = exVetoApplied
        ? `[Checklist de Condições Restritivas do Ex-Tarifário: VETO APLICADO EM CÓDIGO]\n${checklistFormattedReport}\nVeto: ${checklistLog.vetoReason || 'Não atendeu às condições qualificadoras do Ex.'}\n\n`
        : `[Checklist de Condições Restritivas do Ex-Tarifário: HOMOLOGADO]\n${checklistFormattedReport}\n\n`
      finalJustification = `${reportHeader}${finalJustification}`
    }

    const recommendationObject = {
      ncm: recommendedNcmClean,
      ex: primaryTaxRate.ex || recommendedExClean,
      description: primaryDescription,
      ii: iiRate,
      ipi: ipiRate,
      pis: pisRate,
      cofins: cofinsRate,
      total_tax: totalTax,
      has_ex_tarifario: hasEx,
      justification: finalJustification,
      legal_basis: llmResponseJson.legal_basis || primaryTaxRate.legal_basis || {},
      ex_details: exDetails,
    }

    // 15. Gravação no log de auditoria (imp_sim_ncm_classification_log)
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
              sufficient_info: sufficiencyCheck.isSufficient,
              model_used: modelUsed,
              brand,
              model,
              additional_specs: additionalSpecs,
              lean_signature: leanSignature,
              initial_recommendation: initialRecommendation,
              audit_verdict: auditVerdict,
              composition_analysis: compositionAnalysis,
              checklist_log: checklistLog,
              ex_veto_applied: exVetoApplied,
            },
            final_choice_ncm: recommendedNcmClean,
            final_choice_ex: primaryTaxRate.ex || recommendedExClean,
            confirmed_by: callerUserId,
            status: 'pendente',
            product_id: productId,
            imp_sim_product_id: impSimProductId,
            audit_links: webSources,
            knowledge_base_version: '3.0',
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

    // 16. Resposta JSON completa
    const responsePayload = {
      success: true,
      audit_id: auditId,
      recommendation: recommendationObject,
      alternatives: resolvedAlternatives,
      confidence: (llmResponseJson.confidence || 'media').toLowerCase(),
      sufficient_info: sufficiencyCheck.isSufficient,
      web_sources: webSources,
      model_used: modelUsed,
      candidates_count: candidates.length,
      execution_time_ms: executionTimeMs,
      audit_verdict: auditVerdict,
      lean_signature: leanSignature,
      composition_analysis: compositionAnalysis,
      checklist_log: checklistLog,
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
// FUNÇÕES AUXILIARES UNIVERSAIS
// ==========================================

/**
 * Análise de Composição Universal (RGI 3b/3c):
 * Identifica se qualquer produto fornecido é um sistema, conjunto, sortido ou kit com múltiplos componentes.
 * REGRA VINCULANTE (Princípio Genérico):
 * Componentes listados na análise de composição DEVEM ser citados TEXTUALMENTE na descrição/especificações do produto (verbatim).
 * Componente que não aparece explicitamente no texto NÃO pode ser afirmado.
 * Expressões descritivas de uso ou montagem (ex: "camera-mount", "para câmera", "for camera", "camera mount",
 * "rack mount", "pole mount", "shoe mount") indicam montagem/acessório ou compatibilidade, NUNCA a presença do aparelho como componente.
 */
function analyzeProductComposition(text: string): {
  isKit: boolean
  detectedComponents: string[]
  compositionIdentified: boolean
} {
  if (!text) return { isKit: false, detectedComponents: [], compositionIdentified: false }
  const lower = text.toLowerCase()

  const kitIndicators = [
    'sistema',
    'system',
    'conjunto',
    'set',
    'kit',
    'combo',
    'bundle',
    'pack',
    'transmissor + receptor',
    'transmitter and receiver',
    'tx + rx',
    'tx/rx',
    'bodypack + receiver',
  ]

  const isKitExplicit = kitIndicators.some((ind) => lower.includes(ind))

  // Detecção estrita e verbatim de componentes reais do produto
  // Cada componente só é incluído se o texto contiver o substantivo isolado real,
  // excluindo menções puramente adjetivas de interface ou montagem
  const detected: string[] = []

  // 1. Transmissor
  const txMatch = text.match(/\b(transmissor(?:a|es)?|transmitter(?:s)?|bodypack|plug-on)\b/i)
  if (txMatch) {
    detected.push(txMatch[0])
  }

  // 2. Receptor
  const rxMatch = text.match(/\b(receptor(?:a|es)?|receiver(?:s)?|base sintonizadora)\b/i)
  if (rxMatch) {
    detected.push(rxMatch[0])
  }

  // 3. Microfone / Cápsula
  const micMatch = text.match(/\b(microfone(?:s)?|microphone(?:s)?|lavalier|lapela|headset)\b/i)
  if (micMatch) {
    detected.push(micMatch[0])
  }

  // 4. Controlador / Console
  const ctrlMatch = text.match(
    /\b(controlador(?:es)?|controller(?:s)?|console(?:s)?|joystick(?:s)?)\b/i,
  )
  if (ctrlMatch) {
    detected.push(ctrlMatch[0])
  }

  // 5. Câmera: só deve ser reconhecida como componente se constar como dispositivo/substantivo autônomo,
  // JAMAIS quando for modificador de montagem ou suporte (ex: "camera-mount", "camera mount", "for cameras", "para câmeras")
  const textWithoutMountTerms = lower
    .replace(/\bcamera-mount\b/g, '')
    .replace(/\bcamera mount\b/g, '')
    .replace(/\bpara c[aâ]meras?\b/g, '')
    .replace(/\bfor (?:ptz )?cameras?\b/g, '')
    .replace(/\bshoe-mount\b/g, '')
    .replace(/\brack-mount\b/g, '')

  const cameraMatch = textWithoutMountTerms.match(/\b(c[aâ]mera(?:s)?|camcorder(?:s)?)\b/i)
  if (cameraMatch) {
    // Apenas se o texto original ainda contiver a palavra câmera de forma substantiva
    const originalWord = text.match(/\b(c[aâ]mera(?:s)?|camcorder(?:s)?)\b/i)
    if (originalWord) {
      detected.push(originalWord[0])
    }
  }

  // 6. Fonte / Alimentação / Bateria
  const psuMatch = text.match(
    /\b(power supply|fonte de alimenta[cç][aã]o|carregador(?:es)?|bateria(?:s)?|battery)\b/i,
  )
  if (psuMatch) {
    detected.push(psuMatch[0])
  }

  // 7. Lente / Óptica
  const lensMatch = text.match(/\b(lente(?:s)?|lens(?:es)?|[oó]ptica)\b/i)
  if (lensMatch) {
    detected.push(lensMatch[0])
  }

  // Deduplicação preservando verbatim
  const uniqueDetected = Array.from(new Set(detected))

  const hasTxRxPair =
    uniqueDetected.some((d) => /transmi/i.test(d)) && uniqueDetected.some((d) => /recep/i.test(d))
  const isKit = isKitExplicit || hasTxRxPair || uniqueDetected.length >= 2

  // A composição é considerada identificada se não é kit ou se, sendo kit, os componentes foram encontrados no texto
  const compositionIdentified = !isKit || uniqueDetected.length >= 2

  return {
    isKit,
    detectedComponents: uniqueDetected,
    compositionIdentified,
  }
}

/**
 * Extração de Qualificadores de texto de um Ex-Tarifário
 */
function extractExQualifiers(exDesc: string): ExQualifiers {
  const lower = exDesc.toLowerCase()

  // Tipo de sinal
  let signalType: 'digital' | 'analog' | null = null
  if (lower.includes('digital') || lower.includes('digitais')) {
    signalType = 'digital'
  } else if (
    lower.includes('analógico') ||
    lower.includes('analogico') ||
    lower.includes('analógica')
  ) {
    signalType = 'analog'
  }

  // Faixas de frequência ou medidas (ex: 470 a 720MHz, 2.4GHz, etc.)
  const freqRegex =
    /(\d+(?:[.,]\d+)?\s*(?:a|à|-|to)\s*\d+(?:[.,]\d+)?\s*(?:mhz|ghz|khz|hz)|\d+(?:[.,]\d+)?\s*(?:mhz|ghz|khz))/gi
  const frequencyRanges = (exDesc.match(freqRegex) || []).map((m) => m.trim())

  // Item singular (ex: "transmissores de áudio", "receptor", "adaptador") vs "sistemas", "conjuntos"
  const isPluralOrSingularIndividual =
    /^(transmissores|transmissor|receptores|receptor|módulos|módulo|adaptadores|adaptador|antenas|antena|cabos|cabo)\b/i.test(
      exDesc.trim(),
    )
  const isKitDescription = /\b(sistemas|sistema|conjuntos|conjunto|estação completa)\b/i.test(
    exDesc,
  )

  const isSingularItem = isPluralOrSingularIndividual && !isKitDescription
  let singularComponentType: string | null = null
  if (isSingularItem) {
    if (/transmissor/i.test(exDesc)) singularComponentType = 'transmissor'
    else if (/receptor/i.test(exDesc)) singularComponentType = 'receptor'
  }

  return {
    signalType,
    frequencyRanges,
    isSingularItem,
    singularComponentType,
    materialRequirements: [],
    purposeRequirements: [],
    formatPortability:
      lower.includes('portátil') || lower.includes('portateis') ? ['portátil'] : [],
  }
}

/**
 * Checklist Universal de Condições Restritivas do Ex:
 * Confronta CADA qualificador extraído do Ex com as especificações do produto.
 * Produz comparações no padrão "produto: X → Ex exige: Y → ATENDE/NÃO ATENDE/NÃO COMPROVADO".
 *
 * REGRAS VINCULANTES (Princípios Genéricos):
 * 1. Cada productValue do checklist DEVE ser copiado LITERALMENTE das specs do produto.
 * 2. Valor não presente nas specs = status "NÃO COMPROVADO" + acionar busca web para verificar.
 * 3. Verificação de consistência em código: se a descrição contém o termo "analog"/"analógico"
 *    (português/inglês, case-insensitive), o checklist NÃO PODE registrar valor "digital" contraditório,
 *    e vice-versa — quando detectar contradição, forçar "NÃO COMPROVADO" + busca web.
 */
function evaluateExChecklistAgainstProduct(params: {
  exDescription: string
  productText: string
  isKit: boolean
  detectedComponents: string[]
}): ExChecklistResult {
  const qualifiers = extractExQualifiers(params.exDescription)
  const productText = params.productText || ''
  const productLower = productText.toLowerCase()
  const comparisons: ExConditionComparison[] = []
  let passed = true
  let vetoReason = ''
  const missingInformation: string[] = []
  let needsWebSearch = false

  // 1. Condição de Composição: Ex descreve item singular vs produto é conjunto/sistema
  if (qualifiers.isSingularItem && params.isKit) {
    const status = 'NÃO ATENDE'
    passed = false
    vetoReason = `O Ex-Tarifário descreve item singular isolado (${qualifiers.singularComponentType || 'peça individual'}), enquanto o produto é um conjunto/sistema com múltiplos componentes (${params.detectedComponents.join(', ')}). RGI 3b impede a aplicação do Ex singular ao conjunto sem fundamento explícito.`
    comparisons.push({
      name: 'Composição do Equipamento',
      productValue: `Conjunto/Sistema com múltiplos elementos (${params.detectedComponents.join(', ') || 'Kit'})`,
      exRequirement: `Item singular individual (${qualifiers.singularComponentType || 'Componente único'})`,
      status,
      reason: 'Ex singular não se aplica a conjunto completo (RGI 3b/3c)',
    })
  } else if (qualifiers.isSingularItem) {
    comparisons.push({
      name: 'Composição do Equipamento',
      productValue: 'Item individual/singular',
      exRequirement: 'Item singular',
      status: 'ATENDE',
    })
  }

  // 2. Condição de Sinal: Digital vs Analógico
  if (qualifiers.signalType) {
    // Busca verbatim do termo na descrição/specs
    const analogSnippetMatch = productText.match(
      /\b(wireless transmission:\s*analog\s*\w*|analog(?:a|o|ic[ao]s?)?|anal[óo]gic[ao]s?|fm modulation|modula[cç][aã]o anal[óo]gica)\b/i,
    )
    const digitalSnippetMatch = productText.match(
      /\b(wireless transmission:\s*digital\s*\w*|digital(?:is|es)?|modula[cç][aã]o digital|transmiss[aã]o digital)\b/i,
    )

    const hasAnalogTerm = Boolean(analogSnippetMatch)
    const hasDigitalTerm = Boolean(digitalSnippetMatch)

    // Detecção de contradição direta em código:
    // Se a descrição contém "analog"/"analógico" e o Ex exige digital (ou vice-versa)
    if (qualifiers.signalType === 'digital') {
      if (hasAnalogTerm && !hasDigitalTerm) {
        // Copiar literal das specs
        const literalValue = analogSnippetMatch ? analogSnippetMatch[0] : 'Analog'
        passed = false
        vetoReason =
          vetoReason ||
          `Produto opera com sinal analógico ("${literalValue}"), incompatível com a exigência estrita de sinal DIGITAL do Ex-Tarifário.`
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: literalValue,
          exRequirement: 'Sinal Digital',
          status: 'NÃO ATENDE',
          reason: 'Incompatibilidade de sinal (analógico nas specs vs digital exigido pelo Ex)',
        })
      } else if (hasAnalogTerm && hasDigitalTerm) {
        // Contradição detectada nas specs (ex: transmissão analógica com DSP digital)
        // Regra vinculante: forçar "NÃO COMPROVADO" + busca web
        needsWebSearch = true
        missingInformation.push(
          'confirmação se a transmissão de sinal é estritamente digital ou analógica',
        )
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: `${analogSnippetMatch![0]} / ${digitalSnippetMatch![0]}`,
          exRequirement: 'Sinal Digital',
          status: 'NÃO COMPROVADO',
          reason:
            'Contradição detectada nas especificações (termos analógico e digital presentes). Necessária averiguação técnica.',
        })
      } else if (hasDigitalTerm) {
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: digitalSnippetMatch![0],
          exRequirement: 'Sinal Digital',
          status: 'ATENDE',
        })
      } else {
        // Valor não presente nas specs = status "NÃO COMPROVADO" + acionar busca web
        needsWebSearch = true
        missingInformation.push('tipo de sinal de transmissão (digital/analógico)')
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: 'Não mencionado nas especificações',
          exRequirement: 'Sinal Digital',
          status: 'NÃO COMPROVADO',
          reason:
            'Valor não presente nas especificações do produto. Requer validação complementar.',
        })
      }
    } else if (qualifiers.signalType === 'analog') {
      if (hasDigitalTerm && !hasAnalogTerm) {
        const literalValue = digitalSnippetMatch ? digitalSnippetMatch[0] : 'Digital'
        passed = false
        vetoReason =
          vetoReason ||
          `Produto opera com sinal digital ("${literalValue}"), incompatível com a exigência de sinal analógico do Ex-Tarifário.`
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: literalValue,
          exRequirement: 'Sinal Analógico',
          status: 'NÃO ATENDE',
          reason: 'Incompatibilidade de sinal (digital nas specs vs analógico exigido)',
        })
      } else if (hasAnalogTerm && hasDigitalTerm) {
        needsWebSearch = true
        missingInformation.push('confirmação de modulação analógica exclusiva')
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: `${analogSnippetMatch![0]} / ${digitalSnippetMatch![0]}`,
          exRequirement: 'Sinal Analógico',
          status: 'NÃO COMPROVADO',
          reason: 'Contradição detectada nas especificações. Necessária averiguação técnica.',
        })
      } else if (hasAnalogTerm) {
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: analogSnippetMatch![0],
          exRequirement: 'Sinal Analógico',
          status: 'ATENDE',
        })
      } else {
        needsWebSearch = true
        missingInformation.push('tipo de sinal analógico')
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: 'Não mencionado nas especificações',
          exRequirement: 'Sinal Analógico',
          status: 'NÃO COMPROVADO',
          reason: 'Valor não presente nas especificações.',
        })
      }
    }
  }

  // 3. Condição de Faixa de Frequência
  if (qualifiers.frequencyRanges.length > 0) {
    for (const range of qualifiers.frequencyRanges) {
      const numbers = range.match(/\d+(?:[.,]\d+)?/g)
      if (numbers && numbers.length >= 2) {
        const minEx = parseFloat(numbers[0].replace(',', '.'))
        const maxEx = parseFloat(numbers[1].replace(',', '.'))

        // Procurar menção literal no texto
        const productFreqMatches = productText.match(
          /(\d{2,4}(?:[.,]\d+)?)\s*(?:a|-|to)\s*(\d{2,4}(?:[.,]\d+)?)\s*(?:mhz|ghz|khz)/i,
        )
        if (productFreqMatches) {
          const literalFreqSnippet = productFreqMatches[0]
          const minProd = parseFloat(productFreqMatches[1].replace(',', '.'))
          const maxProd = parseFloat(productFreqMatches[2].replace(',', '.'))

          const isContained = minProd >= minEx && maxProd <= maxEx
          if (isContained) {
            comparisons.push({
              name: `Faixa de Frequência (${range})`,
              productValue: literalFreqSnippet,
              exRequirement: `Igual ou contida em ${minEx}-${maxEx}MHz`,
              status: 'ATENDE',
            })
          } else {
            passed = false
            vetoReason =
              vetoReason ||
              `Faixa do produto (${literalFreqSnippet}) fora dos limites exigidos pelo Ex (${minEx}-${maxEx}MHz).`
            comparisons.push({
              name: `Faixa de Frequência (${range})`,
              productValue: literalFreqSnippet,
              exRequirement: `Igual ou contida em ${minEx}-${maxEx}MHz`,
              status: 'NÃO ATENDE',
            })
          }
        } else {
          // Frequência não encontrada nas specs
          needsWebSearch = true
          missingInformation.push(`faixa de frequência (${range})`)
          comparisons.push({
            name: `Faixa de Frequência (${range})`,
            productValue: 'Não mencionada nas especificações',
            exRequirement: range,
            status: 'NÃO COMPROVADO',
            reason: 'Faixa de frequência não explicitada no texto do produto.',
          })
        }
      }
    }
  }

  // Se houver qualquer comparação com status NÃO COMPROVADO, acionar busca na web
  if (comparisons.some((c) => c.status === 'NÃO COMPROVADO')) {
    needsWebSearch = true
  }

  return {
    passed,
    comparisons,
    vetoReason: vetoReason || undefined,
    missingInformation,
    needsWebSearch,
  }
}

/**
 * Recuperação Semântica Orientada por Família de Posições (SEM listas fixas / hardcoded).
 * Mapeia semântica da consulta para posições candidatas no banco garantindo candidatos de setores adjacentes.
 */
async function retrieveSectorOrientedCandidates(params: {
  supabaseAdmin: any
  query: string
  queryEmbedding: number[] | null
  fullTechnicalProfile: string
  detectedComponents?: string[]
  topN: number
}): Promise<any[]> {
  const { supabaseAdmin, query, queryEmbedding, topN, detectedComponents = [] } = params

  const rpcParams: {
    query: string
    query_embedding?: string | null
    top_n: number
    match_threshold: number
  } = {
    query,
    top_n: Math.max(topN * 2, 35),
    match_threshold: 0.01,
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
    throw rpcError
  }

  let candidates = Array.isArray(rawCandidates) ? [...rawCandidates] : []

  // Se componentes foram detectados verbatim na análise de composição (ex: microfone, receptor, transmissor, console, câmera),
  // realizar busca direta no banco de posições fiscais que contemplem esses termos textualmente
  // para garantir que a família correspondente à assinatura/componente do produto entre priorizada
  if (detectedComponents.length > 0) {
    try {
      for (const comp of detectedComponents) {
        // Ignorar termos genéricos ou muito curtos
        const cleanComp = comp.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
        if (cleanComp.length < 4) continue

        // Buscar posições oficiais no banco contendo o termo verbatim
        const { data: compMatches } = await supabaseAdmin
          .from('imp_sim_tax_rates_effective')
          .select('*')
          .ilike('ncm_descricao', `%${cleanComp}%`)
          .limit(8)

        if (compMatches && compMatches.length > 0) {
          for (const m of compMatches) {
            const alreadyExists = candidates.some(
              (c: any) => normalizeNcm(c.ncm) === m.ncm && (c.ex || '') === (m.ex || ''),
            )
            if (!alreadyExists) {
              candidates.push({
                tax_rate_id: m.id,
                ncm: m.ncm,
                ex: m.ex || '',
                ncm_descricao: m.ncm_descricao || '',
                ex_descricao: m.ex_descricao || null,
                source_text: `NCM ${m.ncm} | ${m.ncm_descricao || ''}${m.ex_descricao ? ` | Ex ${m.ex} ${m.ex_descricao}` : ''}`,
                ii_rate: Number(m.ii_efetivo ?? m.ii_rate ?? 0),
                ipi_rate: Number(m.ipi_rate ?? 0),
                pis_rate: Number(m.pis_rate ?? 2.1),
                cofins_rate: Number(m.cofins_rate ?? 9.65),
                has_ex_tarifario: Boolean(m.has_ex_tarifario),
                vector_score: 0.65,
                text_score: 0.85,
                combined_score: 0.75,
                is_component_sector: true,
              })
            }
          }
        }
      }
    } catch (compErr) {
      console.warn('Falha na busca direcionada por componente verbatim:', compErr)
    }
  }

  // Agrupamento semântico por FAMÍLIA DE POSIÇÕES (primeiros 4 dígitos da NCM, ex: 8517, 8518, 8525, 8543)
  // Garantir diversidade semântica: equilibrar candidatos entre a família principal e setores adjacentes
  const families = new Map<string, any[]>()
  for (const c of candidates) {
    const ncmClean = normalizeNcm(c.ncm)
    const familyKey = ncmClean.slice(0, 4)
    if (!families.has(familyKey)) {
      families.set(familyKey, [])
    }
    families.get(familyKey)!.push(c)
  }

  // Ordenar candidatos mantendo diversidade: intercalar candidatos das diferentes famílias encontradas
  // dando prioridade para posições que possuem score alto e candidatos de componentes
  const diversifiedCandidates: any[] = []
  const maxPerFamily = Math.max(3, Math.ceil(topN / Math.max(1, families.size)))

  // Primeiro passar os itens com maior pontuação de cada família
  for (const [_family, famCandidates] of families.entries()) {
    famCandidates.sort((a, b) => (b.combined_score ?? 0) - (a.combined_score ?? 0))
    diversifiedCandidates.push(...famCandidates.slice(0, maxPerFamily))
  }

  // Preencher com o restante até topN ordenado por score
  candidates.sort((a, b) => (b.combined_score ?? 0) - (a.combined_score ?? 0))
  for (const cand of candidates) {
    if (
      !diversifiedCandidates.some(
        (c) => normalizeNcm(c.ncm) === normalizeNcm(cand.ncm) && (c.ex || '') === (cand.ex || ''),
      )
    ) {
      diversifiedCandidates.push(cand)
    }
    if (diversifiedCandidates.length >= topN + 5) break
  }

  return diversifiedCandidates.slice(0, topN)
}

/**
 * Constrói uma assinatura enxuta do produto: Marca + Modelo + Frase central da função.
 * Isola a identidade e função essencial sem ruído de portas, pinos, conectores e acessórios secundários.
 */
function buildLeanProductSignature(params: {
  brand?: string
  model?: string
  description?: string
}): string {
  const brand = (params.brand || '').trim()
  const model = (params.model || '').trim()
  let desc = (params.description || '').trim()

  const firstSentenceMatch = desc.match(/^([^.\n\r;]{10,180})/)
  if (firstSentenceMatch && firstSentenceMatch[1]) {
    desc = firstSentenceMatch[1].trim()
  } else if (desc.length > 180) {
    desc = desc.slice(0, 180).trim()
  }

  // Filtrar ruído de conectores e dimensões secundárias
  desc = desc
    .replace(/\b(bnc|xlr|hdmi|pin|pins|poe|dc in|rs-422|rs232|rj45|db9|tally|gpio)\b[^\s,.]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  const parts: string[] = []
  if (brand && !desc.toLowerCase().includes(brand.toLowerCase())) {
    parts.push(brand)
  }
  if (model && !desc.toLowerCase().includes(model.toLowerCase())) {
    parts.push(model)
  }
  if (desc) {
    parts.push(desc)
  }

  const signature = parts.join(' ').trim()
  return signature || params.description || ''
}

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
  compositionAnalysis: {
    isKit: boolean
    detectedComponents: string[]
    compositionIdentified?: boolean
  }
}): { isSufficient: boolean; reason: string } {
  const desc = params.productDescription.trim()

  if (desc.length < 20) {
    return {
      isSufficient: false,
      reason: 'Descrição muito curta para determinação inequívoca da função essencial.',
    }
  }

  // Regra vinculante (1): Se a descrição interna não permitir identificar a composição com segurança,
  // acionar a busca na web antes de decidir (gatilho condicional, não opcional).
  if (params.compositionAnalysis.isKit && !params.compositionAnalysis.compositionIdentified) {
    return {
      isSufficient: false,
      reason:
        'Produto identificado como conjunto/sistema, mas a descrição interna não permite identificar todos os componentes textualmente. Busca web complementar mandatória.',
    }
  }

  if (
    params.compositionAnalysis.isKit &&
    params.compositionAnalysis.detectedComponents.length < 2
  ) {
    return {
      isSufficient: false,
      reason:
        'Identificado como sistema/conjunto, mas a lista de componentes exige detalhamento técnico adicional.',
    }
  }

  // Verificar presença de dados essenciais como tecnologia de modulação ou frequência em aparelhos transmissores/receptores
  const lower = `${desc} ${params.additionalSpecs}`.toLowerCase()
  const isWirelessTransmitterOrAudio =
    lower.includes('transmissor') ||
    lower.includes('receptor') ||
    lower.includes('wireless') ||
    lower.includes('sem fio') ||
    lower.includes('microfone')

  if (isWirelessTransmitterOrAudio) {
    const hasModulation =
      lower.includes('digital') ||
      lower.includes('analógico') ||
      lower.includes('analogico') ||
      lower.includes('fm')
    const hasFrequency =
      lower.includes('mhz') ||
      lower.includes('ghz') ||
      lower.includes('uhf') ||
      lower.includes('vhf')

    if (!hasModulation || !hasFrequency) {
      return {
        isSufficient: false,
        reason:
          'Aparelho de rádio/comunicação sem detalhamento de modulação (digital/analógica) ou faixa de frequência.',
      }
    }
  }

  return {
    isSufficient: true,
    reason: 'Informações suficientes fornecidas nos parâmetros internos.',
  }
}

/**
 * Busca web complementar para especificações técnicas e datasheets
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

  // Tentativa 2: DuckDuckGo HTML Lite
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
      const resultBlocks = html.split('class="result__body"')
      let count = 0
      for (let i = 1; i < resultBlocks.length && count < 3; i++) {
        const block = resultBlocks[i]
        const urlMatch = block.match(/href="([^"]+)"/)
        const snippetMatch = block.match(/class="result__snippet"[^>]*>(.*?)<\/a>/)
        const titleMatch = block.match(/class="result__title"[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>/)

        if (urlMatch && (snippetMatch || titleMatch)) {
          let rawUrl = urlMatch[1]
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

  try {
    return JSON.parse(clean)
  } catch (_e) {
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
