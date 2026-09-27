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
  status: 'ATENDE' | 'NÃO ATENDE'
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
    const combinedProductText = [productDescription, brand, model, additionalSpecs]
      .filter(Boolean)
      .join(' ')
    const compositionAnalysis = analyzeProductComposition(combinedProductText)

    // 6. GATILHO CONDICIONAL DE BUSCA WEB (ANTES DA DECISÃO)
    // Se as specs internas forem insuficientes para qualificar aspectos técnicos ou condições de Ex,
    // a busca na web DEVE ser acionada imediatamente
    const webSources: WebSource[] = []
    let webContentSummary = ''

    const sufficiencyCheck = evaluateInformationSufficiency({
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
        }
      } catch (webErr) {
        console.warn('Busca web complementar falhou sem interromper classificação:', webErr)
      }
    }

    const fullTechnicalProfile = [combinedProductText, webContentSummary].filter(Boolean).join('\n')

    // 7. RECUPERAÇÃO ORIENTADA POR SETOR (SEM LISTAS HARDCODED)
    // Mapeamento semântico da assinatura do produto para sua família de posições no banco,
    // garantindo diversidade de posições adjacentes
    const openAiKey = Deno.env.get('OPENAI_API_KEY') || ''
    let queryEmbedding: number[] | null = null
    if (openAiKey) {
      try {
        queryEmbedding = await generateEmbedding(leanSignature, openAiKey)
      } catch (embErr) {
        console.warn('Falha ao gerar embedding para assinatura enxuta NCM:', embErr)
      }
    }

    let candidates = await retrieveSectorOrientedCandidates({
      supabaseAdmin,
      query: leanSignature,
      queryEmbedding,
      fullTechnicalProfile,
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

METODOLOGIA OBRIGATÓRIA UNIVERSAL:

1. ANÁLISE DE COMPOSIÇÃO UNIVERSAL (SISTEMAS / CONJUNTOS / KITS - RGI 3b / 3c):
   Para QUALQUER produto reconhecido como sistema, conjunto, sortido ou kit (produtos compostos por múltiplos elementos que operam em conjunto, como transmissor + receptor, console + fonte, módulo óptico + chassi, etc.):
   (a) LISTAR EXPRESSAMENTE OS COMPONENTES que integram o conjunto;
   (b) ENUNCIAR A FUNÇÃO ESSENCIAL DO CONJUNTO como um todo (caráter essencial conferido pela RGI 3b) e classificar por essa função global, e NÃO isoladamente por um único acessório ou peça periférica;
   (c) PROIBIÇÃO ABSOLUTA DE EX SINGULAR PARA CONJUNTO: NUNCA aplique a um conjunto a descrição de um Ex-Tarifário que descreve um item singular/isolado (por exemplo, aplicar um Ex que descreve apenas "transmissor de áudio" a um sistema completo contendo transmissor e receptor), SALVO se houver fundamento explícito demonstrando que o Ex contempla o conjunto inteiro.

2. METODOLOGIA FUNÇÃO-PRIMEIRO (FUNCTION-FIRST) E PROIBIÇÃO DE ATRAÇÃO POR VOCABULÁRIO:
   - Antes de escolher qualquer NCM, enuncie o que o produto É em sua essência.
   - É TERMINANTEMENTE PROIBIDO escolher um candidato NCM ou Ex-Tarifário por coincidência de vocabulário ou termos isolados ("controle", "joystick", "wireless", "áudio") quando a função essencial divergir.
   - Aparelhos de comando/controle, consoles e joysticks eletrônicos pertencem ao Capítulo 85 (8543, 8529, 8537) e JAMAIS a máquinas mecânicas de elevação, pontes rolantes, gruas ou guindastes do Capítulo 84 (8426, 8428).

3. CONDICIONALIDADES RESTRITIVAS DE EX-TARIFÁRIOS:
   - Os Ex-Tarifários são normas de exceção tributária de interpretação estrita (Art. 111 do CTN).
   - Se o texto do Ex exige "sinal DIGITAL" e o produto opera com sinal ANALÓGICO (ou vice-versa), o Ex NÃO PODE ser aplicado.
   - Se o texto do Ex exige uma faixa de frequência, potência, taxa de dados ou material específico, o produto deve atender estritamente a cada uma dessas condições. Se não atender, classifique na posição geral sem Ex ou em outro candidato.

4. UNIVERSO DE CANDIDATOS E FORMATO DE SAÍDA:
   - Escolha o recommended_ncm e recommended_ex EXCLUSIVAMENTE a partir da lista de candidatos fornecida.
   - Responda OBRIGATORIAMENTE em JSON válido sem texto externo, no formato exato:
{
  "is_kit_or_system": boolean,
  "components_list": ["componente 1", "componente 2"],
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
    const initialRecommendation = {
      recommended_ncm: initialRecNcm,
      recommended_ex: initialRecEx,
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

    try {
      const auditorSystemPrompt = `Você é o Auditor Revisor Sênior da Receita Federal e Aduana, atuando como segunda instância independente para homologar ou vetar a recomendação de classificação NCM.

PROTOCOLO OBRIGATÓRIO DE AUDITORIA:
1. ENUNCIAÇÃO DA FUNÇÃO ESSENCIAL: declare o que o produto ou conjunto é.
2. CONJUNTOS / SISTEMAS: NUNCA homologue a aplicação de um Ex-Tarifário singular para um conjunto completo (ex: transmissor + receptor). Se a recomendação manteve Ex incompatível com o conjunto, VETE (action: "VETA") e remova o Ex ou ajuste o NCM.
3. CONDIÇÕES TÉCNICAS: NUNCA homologue Ex de sinal digital para produto analógico (ou vice-versa), nem Ex com restrições divergentes.
4. CONTROLADORES: Se a função for controle remoto de câmeras/PTZ, JAMAIS aprove 8426/8428 (máquinas mecânicas).

RESPOSTA OBRIGATÓRIA EM JSON:
{
  "essential_function": "Função essencial do produto/conjunto",
  "action": "APROVA" ou "VETA",
  "audit_critique": "Análise crítica",
  "corrected_ncm": "8 dígitos se VETA",
  "corrected_ex": "Ex corrigido ou ''",
  "correction_reason": "Fundamentação legal"
}`

      const auditorUserPrompt = `PRODUTO ANALISADO:
- Marca: ${brand || 'Não informada'} | Modelo: ${model || 'Não informado'}
- Descrição: ${productDescription}
- Assinatura: ${leanSignature}
- É Conjunto/Sistema: ${compositionAnalysis.isKit ? 'SIM' : 'NÃO'} (${compositionAnalysis.detectedComponents.join(', ')})
- Especificações: ${additionalSpecs || 'N/A'}

RECOMENDAÇÃO DA 1ª PASSADA:
- Função Enunciada: ${initialRecommendation.essential_function}
- NCM: ${initialRecommendation.recommended_ncm} | Ex: ${initialRecommendation.recommended_ex || 'Nenhum'}
- Status do Checklist em Código: ${checklistLog.passed ? 'ATENDEU' : 'VETADO PELO CÓDIGO'}
${checklistFormattedReport ? `\nCHECKLIST DE CONDIÇÕES DO EX:\n${checklistFormattedReport}\n` : ''}

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
 */
function analyzeProductComposition(text: string): {
  isKit: boolean
  detectedComponents: string[]
} {
  if (!text) return { isKit: false, detectedComponents: [] }
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

  // Detecção de múltiplos componentes funcionais no texto
  const potentialComponents = [
    {
      name: 'Transmissor (TX)',
      regex: /\b(transmissor|transmissora|transmitter|tx|bodypack|plug-on)\b/i,
    },
    { name: 'Receptor (RX)', regex: /\b(receptor|receptora|receiver|rx|base sintonizadora)\b/i },
    { name: 'Microfone', regex: /\b(microfone|microphone|mic|lavalier|lapela|headset|capsule)\b/i },
    {
      name: 'Console/Controlador',
      regex: /\b(controlador|controller|console|painel de controle|joystick)\b/i,
    },
    { name: 'Câmera', regex: /\b(câmera|camera|ptz|camcorder)\b/i },
    {
      name: 'Fonte/Alimentação',
      regex: /\b(fonte de alimentação|power supply|carregador|bateria|battery)\b/i,
    },
    { name: 'Lente/Ótica', regex: /\b(lente|lens|óptica|optics)\b/i },
  ]

  const detected: string[] = []
  for (const comp of potentialComponents) {
    if (comp.regex.test(lower)) {
      detected.push(comp.name)
    }
  }

  // É kit se tem indicador explícito ou se contém pelo menos 2 componentes funcionais complementares (ex: Transmissor + Receptor)
  const hasTxRxPair = detected.includes('Transmissor (TX)') && detected.includes('Receptor (RX)')
  const isKit = isKitExplicit || hasTxRxPair || detected.length >= 2

  return {
    isKit,
    detectedComponents: detected,
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
 * Produz comparações no padrão "produto: X → Ex exige: Y → ATENDE/NÃO ATENDE".
 */
function evaluateExChecklistAgainstProduct(params: {
  exDescription: string
  productText: string
  isKit: boolean
  detectedComponents: string[]
}): ExChecklistResult {
  const qualifiers = extractExQualifiers(params.exDescription)
  const productLower = params.productText.toLowerCase()
  const comparisons: ExConditionComparison[] = []
  let passed = true
  let vetoReason = ''
  const missingInformation: string[] = []

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
    const productIsAnalog =
      productLower.includes('analógico') ||
      productLower.includes('analogico') ||
      productLower.includes('analog') ||
      productLower.includes('fm modulation') ||
      productLower.includes('modulação analógica')

    const productIsDigital =
      productLower.includes('digital') ||
      productLower.includes('dsp') ||
      productLower.includes('aes')

    // Atenção: Muitos equipamentos de áudio possuem processamento interno digital DSP mas transmissão de RF ANALÓGICA (FM)
    // Se o produto é analógico de RF e o Ex exige transmissão via sinal digital
    if (qualifiers.signalType === 'digital') {
      if (productIsAnalog && !productIsDigital) {
        passed = false
        vetoReason =
          vetoReason ||
          'Produto com modulação analógica não atende à exigência estrita de sinal DIGITAL do Ex-Tarifário.'
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: 'Sinal/Modulação Analógica',
          exRequirement: 'Sinal Digital',
          status: 'NÃO ATENDE',
          reason: 'Incompatibilidade de sinal (analógico vs digital exigido)',
        })
      } else if (!productIsAnalog && !productIsDigital) {
        missingInformation.push('tipo de sinal (digital/analógico)')
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: 'Informação não detalhada nas specs internas',
          exRequirement: 'Sinal Digital',
          status: 'NÃO ATENDE',
          reason: 'Informação insuficiente para comprovar atendimento ao requisito estrito do Ex',
        })
      } else {
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: productIsDigital ? 'Sinal Digital' : 'Compatível',
          exRequirement: 'Sinal Digital',
          status: 'ATENDE',
        })
      }
    } else if (qualifiers.signalType === 'analog') {
      if (productIsDigital && !productIsAnalog) {
        passed = false
        vetoReason =
          vetoReason || 'Produto digital não atende à exigência de sinal analógico do Ex-Tarifário.'
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: 'Sinal Digital',
          exRequirement: 'Sinal Analógico',
          status: 'NÃO ATENDE',
        })
      } else {
        comparisons.push({
          name: 'Tipo de Sinal de Transmissão',
          productValue: 'Sinal Analógico',
          exRequirement: 'Sinal Analógico',
          status: 'ATENDE',
        })
      }
    }
  }

  // 3. Condição de Faixa de Frequência
  if (qualifiers.frequencyRanges.length > 0) {
    for (const range of qualifiers.frequencyRanges) {
      // Extrair limites numéricos da faixa do Ex (ex: 470 a 720MHz)
      const numbers = range.match(/\d+(?:[.,]\d+)?/g)
      if (numbers && numbers.length >= 2) {
        const minEx = parseFloat(numbers[0].replace(',', '.'))
        const maxEx = parseFloat(numbers[1].replace(',', '.'))

        // Procurar números de MHz no texto do produto
        const productFreqMatches = productLower.match(
          /(\d{3}(?:[.,]\d+)?)\s*(?:a|-|to)\s*(\d{3}(?:[.,]\d+)?)\s*mhz/i,
        )
        if (productFreqMatches) {
          const minProd = parseFloat(productFreqMatches[1].replace(',', '.'))
          const maxProd = parseFloat(productFreqMatches[2].replace(',', '.'))

          const isContained = minProd >= minEx && maxProd <= maxEx
          if (isContained) {
            comparisons.push({
              name: `Faixa de Frequência (${range})`,
              productValue: `${minProd}-${maxProd}MHz`,
              exRequirement: `Igual ou contida em ${minEx}-${maxEx}MHz`,
              status: 'ATENDE',
            })
          } else {
            passed = false
            vetoReason =
              vetoReason ||
              `Faixa do produto (${minProd}-${maxProd}MHz) fora dos limites exigidos pelo Ex (${minEx}-${maxEx}MHz).`
            comparisons.push({
              name: `Faixa de Frequência (${range})`,
              productValue: `${minProd}-${maxProd}MHz`,
              exRequirement: `Igual ou contida em ${minEx}-${maxEx}MHz`,
              status: 'NÃO ATENDE',
            })
          }
        }
      }
    }
  }

  return {
    passed,
    comparisons,
    vetoReason: vetoReason || undefined,
    missingInformation,
    needsWebSearch: missingInformation.length > 0,
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
  topN: number
}): Promise<any[]> {
  const { supabaseAdmin, query, queryEmbedding, topN } = params

  const rpcParams: {
    query: string
    query_embedding?: string | null
    top_n: number
    match_threshold: number
  } = {
    query,
    top_n: Math.max(topN, 20),
    match_threshold: 0.02,
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

  // Agrupamento semântico por FAMÍLIA DE POSIÇÕES (primeiros 4 dígitos da NCM, ex: 8517, 8518, 8525, 8543)
  // Garantir que o conjunto de candidatos NUNCA fique restrito a uma única posição ou único setor.
  const families = new Map<string, any[]>()
  for (const c of candidates) {
    const ncmClean = normalizeNcm(c.ncm)
    const familyKey = ncmClean.slice(0, 4)
    if (!families.has(familyKey)) {
      families.set(familyKey, [])
    }
    families.get(familyKey)!.push(c)
  }

  // Se uma única família dominou todos os resultados (>80%), buscar candidatos das posições adjacentes
  // sem hardcoding de códigos através de busca textual com a função essencial do perfil
  if (families.size < 2 && candidates.length > 0) {
    try {
      const topCand = candidates[0]
      const ncmClean = normalizeNcm(topCand.ncm)
      const primaryChapter = ncmClean.slice(0, 2) // ex: 85 ou 84 ou 90

      // Busca complementar ampla por texto na tabela de taxas cobrindo o capítulo
      const { data: adjacentRates } = await supabaseAdmin
        .from('imp_sim_tax_rates_effective')
        .select('*')
        .like('ncm', `${primaryChapter}%`)
        .limit(10)

      if (adjacentRates && adjacentRates.length > 0) {
        for (const adj of adjacentRates) {
          if (
            !candidates.some(
              (c: any) => normalizeNcm(c.ncm) === adj.ncm && (c.ex || '') === (adj.ex || ''),
            )
          ) {
            candidates.push({
              tax_rate_id: adj.id,
              ncm: adj.ncm,
              ex: adj.ex || '',
              ncm_descricao: adj.ex_descricao || adj.source || '',
              ex_descricao: adj.ex_descricao || null,
              source_text: `NCM ${adj.ncm} | ${adj.ex_descricao || ''}`,
              ii_rate: Number(adj.ii_efetivo ?? adj.ii_rate ?? 0),
              ipi_rate: Number(adj.ipi_rate ?? 0),
              pis_rate: Number(adj.pis_rate ?? 2.1),
              cofins_rate: Number(adj.cofins_rate ?? 9.65),
              has_ex_tarifario: Boolean(adj.has_ex_tarifario),
              vector_score: 0.5,
              text_score: 0.5,
              combined_score: 0.5,
              is_adjacent_sector: true,
            })
          }
        }
      }
    } catch (adjErr) {
      console.warn('Falha ao recuperar setores adjacentes:', adjErr)
    }
  }

  return candidates.slice(0, topN)
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
  compositionAnalysis: { isKit: boolean; detectedComponents: string[] }
}): { isSufficient: boolean; reason: string } {
  const desc = params.productDescription.trim()

  if (desc.length < 20) {
    return {
      isSufficient: false,
      reason: 'Descrição muito curta para determinação inequívoca da função essencial.',
    }
  }

  // Se for kit/sistema mas os componentes não estão claramente detalhados nas specs
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
