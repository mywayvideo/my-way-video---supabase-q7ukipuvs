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
  status?: 'APROVADO' | 'VETADO' | 'NÃO VERIFICADO'
  requiresExpertReview?: boolean
  comparisons: ExConditionComparison[]
  vetoReason?: string
  missingInformation: string[]
  needsWebSearch: boolean
}

interface CompositionAnalysisResult {
  isKit: boolean
  detectedComponents: string[]
  compositionIdentified: boolean
  targetMachines: string[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Endpoint de verificação de integridade e versão do deploy (GET / ou query param ?health=true)
  const reqUrl = new URL(req.url)
  if (req.method === 'GET' || reqUrl.searchParams.get('health') === 'true') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        function: 'classify-ncm',
        version: '3.3.0-build.605',
        knowledge_base_version: '3.1',
        features: [
          'phase0_canonical_composition_derivation',
          'orphan_ncm_sweep_invariant',
          'ex_checklist_report_suppression_when_no_ex',
          'auditor_role_ai_providers',
          'two_pass_composite_models',
          'family_expansion_6digits',
          'intrafamily_qualifier_tiebreak',
          'candidate_catalog_integrity_check',
          'full_candidate_audit_logging',
        ],
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
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
    // Inicialização prévia de componentes com base no texto comercial para suficiência inicial
    let combinedProductText = [productDescription, brand, model, additionalSpecs]
      .filter(Boolean)
      .join(' ')
    let compositionAnalysis: CompositionAnalysisResult =
      analyzeProductComposition(combinedProductText)

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
        const embeddingInput = [
          leanSignature,
          compositionAnalysis.detectedComponents.join(' '),
          compositionAnalysis.targetMachines.length > 0
            ? `partes acessorios ${compositionAnalysis.targetMachines.join(' ')}`
            : '',
        ]
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
      targetMachines: compositionAnalysis.targetMachines,
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
    // Selecionamos também a coluna 'role' para separar 1ª passada (analyst) e 2ª passada (auditor)
    const { data: rawProviders, error: provError } = await supabaseAdmin
      .from('ai_providers')
      .select(
        'id, provider_name, provider_type, model_id, api_key_secret_name, custom_endpoint, priority_order, role',
      )
      .eq('is_active', true)
      .order('priority_order', { ascending: true })

    if (provError || !rawProviders || rawProviders.length === 0) {
      console.error('Nenhum provedor de IA ativo encontrado em public.ai_providers:', provError)
      return new Response(
        JSON.stringify({
          error: 'Nenhum provedor de IA ativo configurado no sistema.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const allProviders = rawProviders as (LLMProviderConfig & { role?: string })[]

    // Separar provedores dedicados para Análise (1ª passada) e Auditoria (2ª passada)
    // Se houver provedores com role='analyst', usá-los prioritariamente na 1ª passada.
    // Se houver provedores com role='auditor', usá-los prioritariamente na 2ª passada (ex: DeepSeek).
    const analystProviders = allProviders.filter(
      (p) => (p.role || 'general') === 'analyst' || (p.role || 'general') === 'general',
    )
    const primaryAnalystProviders = analystProviders.length > 0 ? analystProviders : allProviders

    const auditorProvidersList = allProviders.filter((p) => (p.role || 'general') === 'auditor')
    const primaryAuditorProviders =
      auditorProvidersList.length > 0 ? auditorProvidersList : allProviders

    // 9. PROMPT UNIVERSAL COM ANÁLISE DE COMPOSIÇÃO (RGI 3b / 3c) E RESTRIÇÃO DE EX
    // Incluir TODOS os candidatos recuperados (incluindo os vindos da expansão de família hierárquica)
    const candidatesCatalogText = candidates
      .map((c: any, index: number) => {
        const exText = c.ex ? ` [Ex-Tarifário: ${c.ex}]` : ' [Sem Ex]'
        const exDesc = c.ex_descricao ? ` | Ex-Desc: ${c.ex_descricao}` : ''
        const fullDesc = c.ncm_descricao_full || c.ncm_descricao || c.source_text || ''
        const expansionTag = c.is_family_expansion
          ? ` [Origem: Expansão de Família Hierárquica ${c.expansion_parent_6 || ''}]`
          : ''
        return `${index + 1}. NCM: ${c.ncm}${exText}${expansionTag}
   Descrição Hierárquica Completa: ${fullDesc}${exDesc}
   Alíquotas Banco: II=${c.ii_rate}%, IPI=${c.ipi_rate}%, PIS=${c.pis_rate}%, COFINS=${c.cofins_rate}%
   Scores: vector=${c.vector_score ?? 0}, combined=${c.combined_score ?? 0}`
      })
      .join('\n\n')

    const systemPrompt = `Você é o Auditor Fiscal Chefe e Perito em Classificação Aduaneira da My Way Video / My Way Business, especialista na Nomenclatura Comum do Mercosul (NCM), Tarifa Externa Comum (TEC), Notas Explicativas do Sistema Harmonizado (NESH), Regras Gerais para Interpretação (RGI) e Ex-Tarifários (GECEX).

SUA MISSÃO:
Analisar as especificações técnicas de qualquer produto ou sistema e determinar a classificação NCM e Ex-Tarifário rigorosamente correta e juridicamente defensável.
Regra permanente: Todas as instruções são princípios genéricos universais aplicáveis a qualquer mercadoria (Capítulos 84, 85, 90, etc.), jamais atreladas a produtos específicos.

METODOLOGIA OBRIGATÓRIA UNIVERSAL:

0. FASE 0 OBRIGATÓRIA — CONHECIMENTO PLENO DO PRODUTO (PRÉ-REQUISITO DA CLASSIFICAÇÃO):
   Antes de qualquer confronto com posições ou códigos NCM, você DEVE construir o perfil técnico completo do produto:
   - Identidade ontológica: o que o produto É em sua substância física e técnica (ex.: "controlador remoto", "câmera", "microfone", "conversor").
   - Função essencial: o que ele faz primariamente, qual sua utilidade e modo de operação (ex.: "controla panorâmica, inclinação e zoom via protocolo IP/serial").
   - Características técnicas relevantes citadas literalmente no texto (interfaces, conectividade, sinais, estrutura).
   - Máquina(s) de destino: se o produto é periférico, parte, acessório ou projetado para operar com uma máquina externa, declare essa máquina. Em construções "X para Y", Y é máquina de destino, JAMAIS componente do produto.
   - Sentença canônica obrigatória: DEVE constar textualmente no campo canonical_statement a frase no padrão exato:
     "o produto é um [tipo] que [função essencial], destinado a [máquina]" (ou "destinado a operação autônoma" se não houver máquina de destino).
   - A recomendação é INVÁLIDA sem a declaração completa do bloco 'product_understanding'.

1. ANÁLISE DE COMPOSIÇÃO UNIVERSAL (SISTEMAS / CONJUNTOS / KITS - RGI 3b / 3c):
   Para QUALQUER produto reconhecido como sistema, conjunto, sortido ou kit (produtos compostos por múltiplos elementos que operam em conjunto, como transmissor + receptor, console + fonte, etc.):
   (a) EXIGÊNCIA VERBATIM: Os componentes listados DEVEM ser citados TEXTUALMENTE na descrição/especificações do produto fora de conectivos de finalidade ("para", "destinado a", "destina-se a", "for", "designed for", "control of") e fora de modificadores de montagem ("-mount").
   (b) FUNÇÃO ESSENCIAL: Enunciar a função essencial do conjunto como um todo (caráter essencial da RGI 3b) e classificar na família de posições que reflete essa função essencial.
   (c) PROIBIÇÃO ABSOLUTA DE EX SINGULAR PARA CONJUNTO: NUNCA aplique a um conjunto a descrição de um Ex-Tarifário que descreve um item singular/isolado, SALVO se houver fundamento explícito demonstrando que o Ex contempla o conjunto inteiro.

2. METODOLOGIA FUNÇÃO-PRIMEIRO (FUNCTION-FIRST) E PRIORIZAÇÃO DA POSIÇÃO ESPECÍFICA:
   - Valide toda a classificação contra a sentença canônica da Fase 0.
   - Posições específicas têm prioridade absoluta sobre posições residuais/genéricas (RGI 3a).
   - Não classifique em posições genéricas de telecomunicação de dados produtos que possuem posição própria correspondente à sua função específica de áudio, imagem ou medição.
   - VETO DE CONTRADIÇÃO DE NATUREZA: É expressamente PROIBIDO classificar o produto em um NCM cuja descrição hierárquica oficial descreva uma natureza ontológica totalmente diferente do produto (por exemplo: classificar um controlador/console periférico como se fosse a máquina que ele controla, ou classificar um cabo/suporte como monitor).
   - PREFERÊNCIA POR FUNÇÃO GENÉRICA COMPATÍVEL SOBRE FUNÇÃO ESPECÍFICA INCOMPATÍVEL: Entre famílias empatadas na escolha, prefira SEMPRE uma posição de função genérica tecnicamente compatível (ex.: máquinas/aparelhos elétricos com função própria, partes e acessórios reconhecíveis) sobre uma posição de função específica incompatível cuja descrição contradiga o produto.

3. REGRA OBRIGATÓRIA DE DESEMPATE INTRAFAMÍLIA (DISCRIMINAÇÃO TÉCNICA TABULADA):
   - Quando mais de uma subposição da mesma família (mesmos 4 ou 6 primeiros dígitos) estiver entre as candidatas (por exemplo: ramos irmãos 8525.89.xx, 8471.xx, 8518.xx, 9007.xx):
     * O DISCRIMINADOR VINCULANTE É O QUALIFICADOR TÉCNICO TABULADO da subposição (número de captadores/sensores de imagem, resolução, tipo de transmissão, dimensões, potência, etc.), situado no SUFIXO FINAL da ncm_descricao_full (após a barra hierárquica "|" ou última vírgula).
     * O qualificador de cada subposição irmã DEVE ser confrontado ponto a ponto com as especificações técnicas reais do produto extraídas na Fase 0.
     * Prevalece OBRIGATORIAMENTE a subposição mais específica cujo qualificador técnico seja plenamente satisfeito pelas especificações do produto (ex.: havendo 3 sensores/captadores, prevalece a subposição específica "Com três ou mais captadores de imagem" sobre subposições genéricas ou residuais "Outras" / sensores únicos).
     * É TERMINANTEMENTE PROIBIDO decidir por menor carga tributária ou por ordem de aparição na lista de candidatos.

4. PROIBIÇÃO ABSOLUTA DE CRITÉRIO TRIBUTÁRIO / ALÍQUOTA:
   - É ESTRITAMENTE PROIBIDO utilizar alíquota ou vantagem tributária (II 0%, Ex vantajoso, redução de carga tributária) como critério de escolha ou desempate.
   - O enquadramento aduaneiro funda-se exclusivamente na função essencial, nas notas da TEC e no texto oficial da NCM/NESH.
   - A alíquota é mera consequência legal do enquadramento técnico, NUNCA motivo ou justificativa.

5. CONDICIONALIDADES RESTRITIVAS DE EX-TARIFÁRIOS:
   - Os Ex-Tarifários são normas de exceção tributária de interpretação estrita (Art. 111 do CTN).
   - Cada valor técnico do produto confrontado com o Ex deve ser copiado LITERALMENTE das especificações. Valor não comprovado ou contraditório impede a concessão do Ex.

6. UNIVERSO DE CANDIDATOS E FORMATO DE SAÍDA:
- Escolha o recommended_ncm e recommended_ex EXCLUSIVAMENTE a partir da lista de candidatos fornecida.
- Na justificativa ("justification"), é OBRIGATÓRIO citar a descrição hierárquica completa oficial (Capítulo | Posição | Subitem do NCM escolhido) para fundamentar com precisão aduaneira o enquadramento.
- HIERARQUIZAÇÃO ENTRE APARELHO COM FUNÇÃO PRÓPRIA E PARTES/ACESSÓRIOS:
  Quando a função essencial for "aparelho com função própria" e existir família de partes/acessórios da máquina de destino, AMBAS as famílias devem constar na resposta (uma na recomendação e a outra nas alternativas) com a devida justificativa técnica de hierarquização.
- Responda OBRIGATORIAMENTE em JSON válido sem texto externo, no formato exato:
{
"product_understanding": {
  "identity": "O que o produto é em sua substância técnica ontológica",
  "essential_function": "Função técnica essencial que confere utilidade primária",
  "technical_features": ["especificação 1", "especificação 2"],
  "target_machines": ["máquina de destino 1"],
  "canonical_statement": "o produto é um [tipo] que [função essencial], destinado a [máquina]"
},
"is_kit_or_system": boolean,
"components_list": ["componente verbatim 1", "componente verbatim 2"],
"essential_function": "Enunciação clara e precisa da função essencial do produto ou conjunto",
"recommended_ncm": "8 dígitos",
"recommended_ex": "número do Ex (ex: '019') ou '' se sem Ex",
"justification": "Justificativa detalhada citando a descrição hierárquica completa (ncm_descricao_full), análise de composição (RGI 3b), confronto com a sentença canônica da Fase 0 e notas da TEC",
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

FASE 0 — INFORMAÇÕES TÉCNICAS DO PRODUTO:
- Componentes físicos integrados (verbatim, fora de conectivos de destino): ${compositionAnalysis.detectedComponents.join(', ') || 'Item singular (sem múltiplos componentes integrados)'}
- Máquina(s) de destino da função (extraídas de conectivos/montagem): ${compositionAnalysis.targetMachines.join(', ') || 'Nenhuma (operação autônoma)'}
- É reconhecido como Sistema / Conjunto / Kit: ${compositionAnalysis.isKit ? 'SIM' : 'NÃO'}

AVALIAÇÃO DE SUFICIÊNCIA DAS INFORMAÇÕES:
- Informações suficientes internamente: ${sufficiencyCheck.isSufficient ? 'SIM' : 'NÃO'} (${sufficiencyCheck.reason})
${webContentSummary ? `\nINFORMAÇÕES TÉCNICAS COMPLEMENTARES OBTIDAS VIA BUSCA WEB:\n${webContentSummary}\n` : ''}

LISTA DE CANDIDATOS NCM VÁLIDOS (Recuperados do Banco de Dados Oficial):
${candidatesCatalogText}

Construa a FASE 0 obrigatória no campo 'product_understanding' com a sentença canônica "o produto é um [tipo] que [função essencial], destinado a [máquina]", avalie todos os candidatos e forneça o JSON estruturado conforme o protocolo aduaneiro.`

    // 10. Chamada ao LLM com cascata de fallback (1ª Passada - Análise Técnica)
    let llmResponseJson: any = null
    let analystModelUsed = ''
    let auditorModelUsed = ''
    let lastLlmError = ''

    for (const provider of primaryAnalystProviders) {
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
            analystModelUsed = `${provider.provider_name} (${provider.model_id})`
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
      status: 'APROVADO',
      requiresExpertReview: false,
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
      } else if (checklistLog.status === 'NÃO VERIFICADO') {
        checklistFormattedReport =
          '• Extração de qualificadores técnicos do Ex resultou vazia: status NÃO VERIFICADO (requer revisão especialista).'
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
      product_understanding: llmResponseJson.product_understanding || null,
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
      product_understanding?: any
    } = {
      action: 'APROVA',
      essential_function: initialRecommendation.essential_function,
      audit_critique: 'Aprovado pelo perito auditor.',
      product_understanding: initialRecommendation.product_understanding,
    }

    // Inicializar auditorModelUsed com o modelo que será chamado ou com o provedor preferencial
    if (primaryAuditorProviders.length > 0) {
      auditorModelUsed = `${primaryAuditorProviders[0].provider_name} (${primaryAuditorProviders[0].model_id})`
    }
    // Se o código determinístico vetou o Ex, registrar o status no initialRecommendation
    if (exVetoApplied) {
      initialRecommendation.recommended_ex = ''
    }

    try {
      const auditorSystemPrompt = `Você é o Auditor Revisor Sênior da Receita Federal e Aduana, atuando como segunda instância independente para homologar ou vetar a recomendação de classificação NCM.

PROTOCOLO OBRIGATÓRIO DE AUDITORIA (PRINCÍPIOS GENÉRICOS UNIVERSAIS):
0. FASE 0 OBRIGATÓRIA — AUDITORIA DE ENTENDIMENTO DO PRODUTO (PRÉ-REQUISITO):
   - Você DEVE conferir se o 'product_understanding' da 1ª passada é perfeitamente coerente com a descrição do produto e suas especificações.
   - Valide se a identidade ontológica, a função essencial e as máquinas de destino estão declaradas corretamente.
   - Em "X para Y", Y é máquina de destino, JAMAIS componente integrado.
   - Entendimento incoerente INVALIDA a recomendação (action: "VETA").
   - Construa ou homologue o perfil técnico na saída com a sentença canônica canônica obrigatória:
     "o produto é um [tipo] que [função essencial], destinado a [máquina]".
1. ENUNCIAÇÃO DA FUNÇÃO ESSENCIAL: declare a função essencial que confere caráter essencial ao produto ou conjunto global (RGI 1 e RGI 3b).
2. DESEMPATE INTRAFAMÍLIA OBRIGATÓRIO (DISCRIMINAÇÃO TÉCNICA TABULADA):
   - Quando mais de uma subposição da mesma família hierárquica (mesmos 4 ou 6 primeiros dígitos) estiver presente entre as candidatas:
     * O DISCRIMINADOR VINCULANTE É O QUALIFICADOR TÉCNICO TABULADO da subposição (nº de captadores/sensores de imagem, resolução, tecnologia do sensor, tipo de modulação, dimensões, potência, etc.), situado no sufixo final da ncm_descricao_full.
     * Esse qualificador DEVE ser confrontado rigorosamente com as especificações do produto extraídas na Fase 0 (ex.: se o produto tem 3 sensores de imagem CMOS/CCD, a subposição específica "Com três ou mais captadores de imagem" DEVE prevalecer sobre qualquer outra subposição residual ou de sensor único da mesma família).
     * Prevalece OBRIGATORIAMENTE a subposição mais específica cujo qualificador seja satisfeito pelas especificações do produto.
     * É TERMINANTEMENTE PROIBIDO decidir por menor carga tributária ou por ordem de aparição na lista. Se a 1ª passada escolheu uma subposição menos específica ou com qualificador incorreto, você DEVE VETAR e CORRIGIR ("corrected_ncm").
3. O VETO AO EX-TARIFÁRIO NÃO ENCERRA A ANÁLISE:
   - Vetar um Ex-Tarifário NÃO significa manter automaticamente o NCM base residual.
   - O auditor DEVE re-confrontar a descrição oficial da posição/subposição do NCM base com a função essencial do produto.
   - Se a descrição da posição base não corresponder com exatidão à função essencial, a recomendação DEVE MIGRAR (action: "VETA") para a família correta entre os candidatos disponíveis.
4. CONJUNTOS / SISTEMAS: NUNCA homologue Ex-Tarifário singular individual para conjuntos ou sistemas de múltiplos elementos funcionais.
5. CONDIÇÕES TÉCNICAS E COERÊNCIA (A CORREÇÃO NÃO É SEGUNDA CHANCE SEM AUDITORIA):
   - A NCM/Ex corrigido na 2ª passada deve passar pelo MESMO checklist de condições restritivas e confronto com a sentença canônica da Fase 0.
   - É terminantemente VETADO qualquer candidato cuja descrição hierárquica (ncm_descricao_full) contradiga a natureza ontológica do produto (ex.: candidato descreve "câmera" para um produto que é controlador remoto; candidato descreve "monitor" para um produto que é cabo ou transmissor).
6. PROIBIÇÃO ESTRITA DE VANTAGEM TRIBUTÁRIA / ALÍQUOTA:
   - É ESTRITAMENTE PROIBIDO usar alíquota ou vantagem fiscal (II 0%, Ex vantajoso) como critério de escolha ou desempate.
7. PREFERÊNCIA POR FUNÇÃO GENÉRICA COMPATÍVEL SOBRE FUNÇÃO ESPECÍFICA INCOMPATÍVEL:
   - Entre famílias empatadas na correção, prefira SEMPRE uma posição de função genérica tecnicamente compatível (ex.: aparelhos com função própria, partes e acessórios reconhecíveis) sobre uma posição de função específica incompatível.
8. VETO A TODAS AS ALTERNATIVAS:
   - O veto por contradição de natureza e coerência técnica vale para TODA a lista de alternativas. Nenhuma alternativa com autocontradição ou incompatibilidade ontológica pode ser mantida.

RESPOSTA OBRIGATÓRIA EM JSON:
{
  "product_understanding": {
    "identity": "Identidade do produto",
    "essential_function": "Função essencial",
    "target_machines": ["máquina de destino"],
    "canonical_statement": "o produto é um [tipo] que [função essencial], destinado a [máquina]",
    "coherent_with_description": boolean
  },
  "essential_function": "Função essencial do produto/conjunto",
  "action": "APROVA" ou "VETA",
  "audit_critique": "Análise crítica do confronto entre a descrição do NCM, o product_understanding e a função essencial",
  "corrected_ncm": "8 dígitos se VETA",
  "corrected_ex": "Ex corrigido ou ''",
  "correction_reason": "Fundamentação legal da migração de posição ou do veto"
}`

      const auditorUserPrompt = `PRODUTO ANALISADO:
- Marca: ${brand || 'Não informada'} | Modelo: ${model || 'Não informado'}
- Descrição: ${productDescription}
- Assinatura: ${leanSignature}
- É Conjunto/Sistema: ${compositionAnalysis.isKit ? 'SIM' : 'NÃO'} (Componentes verbatim fora de conectivos: ${compositionAnalysis.detectedComponents.join(', ') || 'Nenhum identificado textualmente'})
- Máquina(s) de destino identificadas: ${compositionAnalysis.targetMachines.join(', ') || 'Nenhuma (operação autônoma)'}
- Especificações: ${additionalSpecs || 'N/A'}

RECOMENDAÇÃO DA 1ª PASSADA:
- Entendimento do Produto (Fase 0): ${JSON.stringify(initialRecommendation.product_understanding || {})}
- Função Enunciada: ${initialRecommendation.essential_function}
- NCM: ${initialRecommendation.recommended_ncm} | Ex: ${initialRecommendation.recommended_ex || 'Nenhum'}
- Status do Checklist em Código: ${checklistLog.passed ? checklistLog.status || 'ATENDEU' : 'VETADO PELO CÓDIGO'}
${checklistFormattedReport ? `\nCHECKLIST DE CONDIÇÕES DO EX:\n${checklistFormattedReport}\n` : ''}

ATENÇÃO AUDITOR:
1. DESEMPATE INTRAFAMÍLIA: Verifique se existem subposições irmãs no mesmo ramo (mesmos 6 primeiros dígitos) no catálogo abaixo. Confrontar o qualificador discriminante no final da ncm_descricao_full com as especificações do produto (ex.: nº de sensores/captadores, resolução, tipo de transmissão). Prevalece SEMPRE a subposição mais específica correspondente às especificações reais. VETE e corrija se a 1ª passada escolheu subposição irmã menos específica ou inadequada.
2. Se o Ex foi vetado ou se a posição base recomendada (${initialRecommendation.recommended_ncm}) não descreve a função essencial da mercadoria com exatidão e existem posições específicas de família no catálogo abaixo, VETE (action: "VETA") e MIGRE para o NCM mais adequado entre os candidatos disponíveis.
3. VETAR O EX NÃO SIGNIFICA MANTER O NCM RESIDUAL: Você DEVE verificar se a posição base 4/6/8 dígitos faz sentido para o produto. Se não fizer, altere o NCM em "corrected_ncm".
4. A CORREÇÃO DEVE RESPEITAR A NATUREZA DO PRODUTO: Jamais corrija para um NCM cuja descrição contradiga o que o produto é (ex.: não escolha NCM de câmera para controlador, nem NCM de máquinas para produto eletroeletrônico).
5. É TERMINANTEMENTE PROIBIDO escolher por benefício fiscal (alíquota zero/reduzida) ou por ordem de recuperação. O critério é 100% técnico.
6. Se houver dúvida entre posições específicas que contradizem o produto e posições genéricas compatíveis (máquinas com função própria / partes e acessórios), prefira a genérica compatível.

LISTA DE CANDIDATOS VÁLIDOS:
${candidatesCatalogText}`

      for (const provider of primaryAuditorProviders) {
        const apiKey = Deno.env.get(provider.api_key_secret_name) || ''
        if (!apiKey) continue

        try {
          const auditRawContent = await invokeLLMWithTimeout(
            provider,
            apiKey,
            auditorSystemPrompt,
            auditorUserPrompt,
            20000,
          )
          const parsedAudit = parseLLMJsonResponse(auditRawContent)
          if (parsedAudit && (parsedAudit.action === 'APROVA' || parsedAudit.action === 'VETA')) {
            auditorModelUsed = `${provider.provider_name} (${provider.model_id})`
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
              product_understanding:
                parsedAudit.product_understanding || initialRecommendation.product_understanding,
            }
            break
          }
        } catch (auditCallErr) {
          console.warn(
            `Falha na chamada de auditoria com provedor ${provider.provider_name}:`,
            auditCallErr,
          )
        }
      }

      // 12.A AUDITORIA RIGOROSA DA 2ª PASSADA (CORREÇÃO DO AUDITOR)
      // A correção do auditor não é um salvo-conduto: deve passar por auditoria técnica completa.
      if (auditVerdict.action === 'VETA' && auditVerdict.corrected_ncm) {
        let correctedDigits = normalizeNcm(auditVerdict.corrected_ncm)
        let correctedExDigits = (auditVerdict.corrected_ex || '').toString().trim()

        let candidateMatch =
          candidates.find(
            (c: any) =>
              normalizeNcm(c.ncm) === correctedDigits &&
              (!correctedExDigits || (c.ex || '').trim() === correctedExDigits),
          ) || candidates.find((c: any) => normalizeNcm(c.ncm) === correctedDigits)

        // Se o candidato corrigido não existir nos candidatos recuperados, manter recomendação inicial
        if (!candidateMatch) {
          console.warn(
            `[Auditoria 2ª Passada] Candidato corrigido ${correctedDigits} não encontrado no catálogo. Mantendo 1ª passada.`,
          )
        } else {
          // (1) VERIFICAÇÃO DE VEDAÇÃO POR CONTRADIÇÃO DE NATUREZA:
          // A descrição hierárquica do candidato não pode contradizer a natureza essencial do produto
          const natureContradiction = checkNatureContradiction({
            productText: fullTechnicalProfile,
            candidateDesc:
              candidateMatch.ncm_descricao_full ||
              candidateMatch.ncm_descricao ||
              candidateMatch.source_text ||
              '',
            detectedComponents: compositionAnalysis.detectedComponents,
          })

          // (2) VERIFICAÇÃO DE PROIBIÇÃO DE CRITÉRIO FISCAL / ALÍQUOTA:
          // Se a justificativa do auditor cita explicitamente termos tributários/alíquotas como motivo de escolha
          const taxCriterionCheck = checkTaxAdvantageCriterion({
            auditCritique: auditVerdict.audit_critique,
            correctionReason: auditVerdict.correction_reason,
            initialCandidate:
              activeExCandidate ||
              candidates.find((c: any) => normalizeNcm(c.ncm) === initialRecNcm),
            correctedCandidate: candidateMatch,
          })

          // (3) CHECKLIST DE CONDIÇÕES RESTRITIVAS DO EX NA CORREÇÃO (se houver Ex):
          let correctedChecklistLog: ExChecklistResult = {
            passed: true,
            status: 'APROVADO',
            requiresExpertReview: false,
            comparisons: [],
            missingInformation: [],
            needsWebSearch: false,
          }

          if (correctedExDigits && candidateMatch.ex_descricao) {
            correctedChecklistLog = evaluateExChecklistAgainstProduct({
              exDescription: candidateMatch.ex_descricao,
              productText: fullTechnicalProfile,
              isKit: compositionAnalysis.isKit,
              detectedComponents: compositionAnalysis.detectedComponents,
            })

            if (!correctedChecklistLog.passed) {
              console.warn(
                `[Auditoria 2ª Passada] Ex ${correctedExDigits} proposto pelo auditor NÃO atende às condições. Removendo Ex da correção.`,
              )
              correctedExDigits = ''
              auditVerdict.corrected_ex = ''
            }
          }

          // Se a correção do auditor foi VETADA pela verificação de natureza ontológica ou critério fiscal
          if (natureContradiction.contradicted || taxCriterionCheck.violatesTaxProhibition) {
            console.warn(
              `[Auditoria 2ª Passada: VETO DA CORREÇÃO] Correção para ${correctedDigits} foi vetada:`,
              natureContradiction.reason || taxCriterionCheck.reason,
            )

            // (4) PREFERÊNCIA POR FUNÇÃO GENÉRICA COMPATÍVEL SOBRE ESPECÍFICA INCOMPATÍVEL:
            // Tentar selecionar a melhor alternativa tecnicamente compatível
            const fallbackCandidate = selectBestCompatibleFallback({
              candidates,
              rejectedNcms: [initialRecNcm, correctedDigits],
              productText: fullTechnicalProfile,
              detectedComponents: compositionAnalysis.detectedComponents,
            })

            if (fallbackCandidate) {
              const fallbackNcmClean = normalizeNcm(fallbackCandidate.ncm)
              const fallbackExClean = (fallbackCandidate.ex || '').toString().trim()
              console.log(
                `[Auditoria 2ª Passada: Fallback de Função Genérica Compatível] Selecionado NCM ${fallbackNcmClean} (Ex ${fallbackExClean || 'sem Ex'}).`,
              )

              auditVerdict.override_applied = true
              auditVerdict.override_reason = `Correção do auditor para ${correctedDigits} vetada (${natureContradiction.reason || taxCriterionCheck.reason}). Aplicada preferência técnica por função genérica compatível NCM ${fallbackNcmClean}.`
              auditVerdict.corrected_ncm = fallbackNcmClean
              auditVerdict.corrected_ex = fallbackExClean
              auditVerdict.correction_reason = auditVerdict.override_reason

              llmResponseJson.recommended_ncm = fallbackNcmClean
              llmResponseJson.recommended_ex = fallbackExClean
              llmResponseJson.justification = `[Revisão de Auditoria Aduaneira: Veto e Enquadramento Técnico Compatível]\n${auditVerdict.override_reason}`

              // Atualizar checklist se o novo candidato tiver Ex
              if (fallbackExClean && fallbackCandidate.ex_descricao) {
                checklistLog = evaluateExChecklistAgainstProduct({
                  exDescription: fallbackCandidate.ex_descricao,
                  productText: fullTechnicalProfile,
                  isKit: compositionAnalysis.isKit,
                  detectedComponents: compositionAnalysis.detectedComponents,
                })
              }
            } else {
              // Se não encontrou fallback melhor, anular a correção inválida do auditor
              auditVerdict.action = 'APROVA'
              auditVerdict.audit_critique += ` [Nota: A correção proposta para ${correctedDigits} foi rejeitada por incompatibilidade técnica com o produto].`
            }
          } else {
            // Correção do auditor é tecnicamente válida e aceita
            llmResponseJson.recommended_ncm = correctedDigits
            llmResponseJson.recommended_ex = correctedExDigits
            llmResponseJson.justification = `[Revisão de Auditoria Aduaneira: Veto e Correção Homologados]\n${auditVerdict.correction_reason || auditVerdict.audit_critique}`

            if (correctedExDigits) {
              checklistLog = correctedChecklistLog
            }
          }
        }
      }
    } catch (auditErr) {
      console.warn('Falha na segunda passada de auditoria:', auditErr)
    }

    // 13. Resolução estrita das alíquotas efetivas via public.imp_sim_tax_rates_effective
    const recommendedNcmClean = normalizeNcm(llmResponseJson.recommended_ncm)
    // INVARIANTE ABSOLUTA: Se o veto ao Ex foi aplicado (exVetoApplied === true), recommendedExClean DEVE ser vazio ('')
    const recommendedExClean = exVetoApplied
      ? ''
      : (llmResponseJson.recommended_ex || '').toString().trim()

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

    // CALIBRAÇÃO: COMPOSITION_ANALYSIS DERIVADA DIRETAMENTE DA FASE 0 (Auditada pela IA)
    // Descartar extração ruidosa de targetMachines por regex comercial.
    // Derivar targetMachines canônicas de product_understanding.target_machines.
    // isKit: true SOMENTE se o produto é comercializado como conjunto de múltiplos itens fisicamente
    // autônomos vendidos juntos (ex: transmissor + receptor), JAMAIS aparelho singular.
    const finalProductUnderstanding = auditVerdict?.product_understanding ||
      llmResponseJson?.product_understanding || {
        identity: leanSignature,
        essential_function: initialRecommendation.essential_function,
        target_machines: compositionAnalysis.targetMachines,
        canonical_statement: `o produto é um ${leanSignature} que ${initialRecommendation.essential_function}, destinado a ${compositionAnalysis.targetMachines.join(', ') || 'operação autônoma'}`,
      }

    const rawTargetMachinesFromPhase0: string[] = Array.isArray(
      finalProductUnderstanding?.target_machines,
    )
      ? finalProductUnderstanding.target_machines
      : []

    // Filtrar e normalizar targetMachines da Fase 0
    const canonicalTargetMachines = Array.from(
      new Set(
        rawTargetMachinesFromPhase0
          .map((tm: any) => String(tm || '').trim())
          .filter(
            (tm: string) =>
              tm.length >= 3 &&
              !/^(controle|panorâmica|panor[aâ]mica|zoom|pan|tilt|operacao|operação|autonoma|autônoma|nenhuma)$/i.test(
                tm,
              ),
          ),
      ),
    )

    // Avaliação canônica de isKit: apenas se múltiplos itens fisicamente autônomos
    // (ex: transmissor + receptor, TX+RX) ou explicitamente reconhecido pelo modelo e auditado
    const isActuallyKit = evaluateCanonicalIsKit({
      productUnderstanding: finalProductUnderstanding,
      productText: combinedProductText,
      initialDetectedComponents: compositionAnalysis.detectedComponents,
    })

    compositionAnalysis = {
      isKit: isActuallyKit,
      detectedComponents: isActuallyKit ? compositionAnalysis.detectedComponents : [],
      compositionIdentified: isActuallyKit
        ? compositionAnalysis.detectedComponents.length >= 2
        : true,
      targetMachines: canonicalTargetMachines,
    }

    // 14. Resolver alíquotas para alternativas com PROPAGAÇÃO DE VETO (Princípio Genérico):
    // Um NCM vetado pelo auditor ou pelo checklist de código NÃO PODE aparecer na recomendação nem nas alternativas.
    // Montar conjunto de NCMs vetados para exclusão estrita de toda a resposta.
    const vetoedNcms = new Set<string>()

    // Se o auditor vetou a 1ª passada, o NCM inicial foi vetado
    if (auditVerdict.action === 'VETA') {
      vetoedNcms.add(normalizeNcm(initialRecommendation.recommended_ncm))
    }

    // Se a correção do auditor foi vetada pelo override de natureza/tributário
    if (auditVerdict.override_applied && auditVerdict.corrected_ncm) {
      // O NCM originalmente proposto pelo auditor antes do override foi vetado
      const rawAuditCorrection = normalizeNcm(
        (auditVerdict.override_reason || '').match(/\b(\d{8})\b/)?.[1] || '',
      )
      if (rawAuditCorrection) {
        vetoedNcms.add(rawAuditCorrection)
      }
    }

    // Se a correção do auditor foi rejeitada e revertida
    if (auditVerdict.action === 'APROVA' && auditVerdict.audit_critique.includes('foi rejeitada')) {
      const matchRejected = auditVerdict.audit_critique.match(/para\s+(\d{8})\s+foi\s+rejeitada/i)
      if (matchRejected && matchRejected[1]) {
        vetoedNcms.add(normalizeNcm(matchRejected[1]))
      }
    }

    const resolvedAlternatives: any[] = []
    const rawAlternatives = Array.isArray(llmResponseJson.alternatives)
      ? llmResponseJson.alternatives
      : []

    for (const alt of rawAlternatives) {
      const altNcmClean = normalizeNcm(alt.ncm || '')
      if (!altNcmClean || altNcmClean === recommendedNcmClean) continue
      // PROPAGAÇÃO DE VETO: se o NCM foi vetado pelo auditor, ignorar
      if (vetoedNcms.has(altNcmClean)) {
        console.log(
          `[Propagação de Veto]: NCM alternativo ${altNcmClean} descartado pois foi vetado pelo auditor.`,
        )
        continue
      }

      // (a) VETO POR AUTOCONTRADIÇÃO NO CAMPO REASON:
      // Se o próprio campo reason afirma que ela não é adequada ("não é a classificação mais adequada",
      // "não se aplica", "inadequado", etc.), deve ser removida em código — autocontradição veta a linha
      const reasonLower = (alt.reason || '').toLowerCase()
      const selfContradictoryPatterns = [
        /n[aã]o [eé] a (?:classifica[cç][aã]o )?mais adequada/i,
        /n[aã]o [eé] adequada/i,
        /n[aã]o [eé] apropriad[ao]/i,
        /n[aã]o se aplica/i,
        /incompat[ií]vel com/i,
        /contradit[oó]ri[ao]/i,
        /incorret[ao]/i,
        /vetad[ao]/i,
      ]
      const isSelfContradictory = selfContradictoryPatterns.some((pat) => pat.test(reasonLower))
      if (isSelfContradictory) {
        console.log(
          `[Veto por Autocontradição]: Alternativa ${altNcmClean} removida por declarar que não é adequada no próprio reason: "${alt.reason}"`,
        )
        vetoedNcms.add(altNcmClean)
        continue
      }

      const altExClean = (alt.ex || '').toString().trim()
      // =========================================================================
      // CORREÇÃO (3) — INTEGRIDADE DE ALTERNATIVAS (PRINCÍPIO GENÉRICO UNIVERSAL)
      // =========================================================================
      // A descrição exibida de cada alternativa (e de seu Ex-Tarifário) deve
      // pertencer à MESMA linha NCM+Ex do catálogo recuperado.
      // Quando a descrição não corresponder à linha, substituir pela descrição oficial
      // da linha correta, NUNCA reaproveitar texto de outra entrada.
      let altTaxRate = altExClean
        ? await resolveEffectiveTaxRate(supabaseAdmin, altNcmClean, altExClean)
        : null

      if (!altTaxRate) {
        altTaxRate = await resolveEffectiveTaxRate(supabaseAdmin, altNcmClean, '')
      }

      if (!altTaxRate) {
        altTaxRate = candidates.find((c: any) => normalizeNcm(c.ncm) === altNcmClean)
      }

      if (altTaxRate) {
        // Garantir que a linha oficial consultada seja estritamente daquela NCM+Ex
        let officialRow = altTaxRate
        const finalCandidateEx = (altTaxRate.ex || altExClean || '').toString().trim()

        // Se a linha consultada divergir ou se não tiver a descrição oficial canônica da base
        if (!officialRow.ncm_descricao_full) {
          const { data: dbExactRow } = await supabaseAdmin
            .from('imp_sim_tax_rates')
            .select(
              'ncm, ex, ncm_descricao_full, ncm_descricao, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
            )
            .eq('ncm', altNcmClean)
            .limit(1)
            .maybeSingle()
          if (dbExactRow) {
            officialRow = { ...officialRow, ...dbExactRow }
          }
        }

        // A descrição oficial é rigorosamente a da própria linha NCM (ncm_descricao_full)
        // e, havendo Ex válido e coincidente com a linha oficial, o ex_descricao oficial daquela linha
        let altFinalEx = officialRow.ex || altExClean || ''
        let altOfficialExDesc: string | null = officialRow.ex_descricao || null

        // Se o Ex citado não existir na linha oficial recuperada para este NCM, zerar o Ex
        // para não herdar descrição de Ex de outro NCM
        if (altFinalEx && officialRow.ex && normalizeNcm(officialRow.ncm) === altNcmClean) {
          if (String(officialRow.ex).trim() !== String(altFinalEx).trim()) {
            altFinalEx = ''
            altOfficialExDesc = null
          }
        } else if (altFinalEx && !officialRow.ex) {
          // Verificar se esse NCM realmente tem esse Ex na base
          const { data: exCheckRow } = await supabaseAdmin
            .from('imp_sim_tax_rates')
            .select('ex, ex_descricao')
            .eq('ncm', altNcmClean)
            .eq('ex', altFinalEx)
            .maybeSingle()
          if (!exCheckRow) {
            altFinalEx = ''
            altOfficialExDesc = null
          } else {
            altOfficialExDesc = exCheckRow.ex_descricao
          }
        }

        // Validação de checklist de Ex se houver Ex
        if (altFinalEx && altOfficialExDesc) {
          const altExCheck = evaluateExChecklistAgainstProduct({
            exDescription: altOfficialExDesc,
            productText: fullTechnicalProfile,
            isKit: compositionAnalysis.isKit,
            detectedComponents: compositionAnalysis.detectedComponents,
          })
          if (!altExCheck.passed) {
            altFinalEx = ''
            altOfficialExDesc = null
          }
        }

        // Montar a descrição estritamente atrelada à MESMA linha NCM+Ex do catálogo
        const officialFullNcmDesc =
          officialRow.ncm_descricao_full || officialRow.ncm_descricao || ''
        const altDesc =
          altFinalEx && altOfficialExDesc
            ? `${officialFullNcmDesc} | Ex ${altFinalEx}: ${altOfficialExDesc}`
            : officialFullNcmDesc

        // (b) VETO POR CONTRADIÇÃO DE NATUREZA NA ALTERNATIVA:
        const altNatureContradiction = checkNatureContradiction({
          productText: fullTechnicalProfile,
          candidateDesc: altDesc,
          detectedComponents: compositionAnalysis.detectedComponents,
        })
        if (altNatureContradiction.contradicted) {
          console.log(
            `[Veto Natureza Alternativa]: NCM ${altNcmClean} descartado das alternativas por contradição de natureza.`,
          )
          vetoedNcms.add(altNcmClean)
          continue
        }

        const altIi = Number(officialRow.ii_efetivo ?? officialRow.ii_rate ?? 0)
        const altIpi = Number(officialRow.ipi_rate ?? 0)
        const altPis = Number(officialRow.pis_rate ?? 2.1)
        const altCofins = Number(officialRow.cofins_rate ?? 9.65)
        const altTotal = Number((altIi + altIpi + altPis + altCofins).toFixed(2))

        resolvedAlternatives.push({
          ncm: altNcmClean,
          ex: altFinalEx,
          description: altDesc,
          ii: altIi,
          ipi: altIpi,
          pis: altPis,
          cofins: altCofins,
          total_tax: altTotal,
          has_ex_tarifario: Boolean(altFinalEx),
          reason: alt.reason || 'Posição fiscal alternativa aplicável.',
        })
      }
    }

    // Se sobrou espaço nas alternativas e temos família de partes/acessórios da máquina de destino,
    // garantir que conste nas alternativas com justificativa de hierarquização
    const partsCand = candidates.find(
      (c: any) =>
        Boolean(c.is_target_machine_parts) &&
        normalizeNcm(c.ncm) !== recommendedNcmClean &&
        !vetoedNcms.has(normalizeNcm(c.ncm)) &&
        !resolvedAlternatives.some((a) => a.ncm === normalizeNcm(c.ncm)),
    )
    if (partsCand && resolvedAlternatives.length < 3) {
      const pNcm = normalizeNcm(partsCand.ncm)
      const pIi = Number(partsCand.ii_rate ?? 0)
      const pIpi = Number(partsCand.ipi_rate ?? 0)
      const pPis = Number(partsCand.pis_rate ?? 2.1)
      const pCofins = Number(partsCand.cofins_rate ?? 9.65)
      resolvedAlternatives.unshift({
        ncm: pNcm,
        ex: partsCand.ex || '',
        description:
          partsCand.ex_descricao || partsCand.ncm_descricao_full || partsCand.ncm_descricao || '',
        ii: pIi,
        ipi: pIpi,
        pis: pPis,
        cofins: pCofins,
        total_tax: Number((pIi + pIpi + pPis + pCofins).toFixed(2)),
        has_ex_tarifario: Boolean(partsCand.has_ex_tarifario),
        reason:
          'Família de partes e acessórios reconhecíveis da máquina de destino da função (RGI 1 / Nota 2 do Capítulo). Hierarquizada como alternativa diante de aparelho autônomo com função própria.',
      })
    }

    if (resolvedAlternatives.length === 0) {
      for (const cand of candidates) {
        const cNcm = normalizeNcm(cand.ncm)
        // Integridade estrita: a descrição pertence à própria linha do candidato
        const cFullDesc = cand.ncm_descricao_full || cand.ncm_descricao || ''
        const cDesc =
          cand.ex && cand.ex_descricao
            ? `${cFullDesc} | Ex ${cand.ex}: ${cand.ex_descricao}`
            : cFullDesc || cand.source_text || ''

        // Verificar contradição de natureza
        const natureCheck = checkNatureContradiction({
          productText: fullTechnicalProfile,
          candidateDesc: cDesc,
          detectedComponents: compositionAnalysis.detectedComponents,
        })
        if (natureCheck.contradicted) {
          vetoedNcms.add(cNcm)
          continue
        }

        if (
          cNcm !== recommendedNcmClean &&
          !vetoedNcms.has(cNcm) &&
          resolvedAlternatives.length < 3
        ) {
          const cIi = Number(cand.ii_rate ?? 0)
          const cIpi = Number(cand.ipi_rate ?? 0)
          const cPis = Number(cand.pis_rate ?? 2.1)
          const cCofins = Number(cand.cofins_rate ?? 9.65)
          resolvedAlternatives.push({
            ncm: cNcm,
            ex: cand.ex || '',
            description: cDesc,
            ii: cIi,
            ipi: cIpi,
            pis: cPis,
            cofins: cCofins,
            total_tax: Number((cIi + cIpi + cPis + cCofins).toFixed(2)),
            has_ex_tarifario: Boolean(cand.has_ex_tarifario),
            reason: 'Candidato alternativo não vetado com aderência semântica na base oficial.',
          })
        }
      }
    }

    const executionTimeMs = Date.now() - startTime

    const primaryDescription =
      primaryTaxRate.ex_descricao ||
      primaryTaxRate.ncm_descricao_full ||
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

    // SUPRESSÃO DO BLOCO DE EX QUANDO NÃO HÁ EX:
    // O bloco de checklist formatado só é injetado no relatório do usuário se houver Ex homologado na resposta final.
    // Sem Ex na resposta final (finalRecommendationEx vazio), o bloco é omitido do relatório ao usuário,
    // mantendo os detalhes técnicos preservados no checklist_log interno e na telemetria.
    if (checklistFormattedReport && Boolean(recommendedExClean) && !exVetoApplied) {
      let reportHeader = ''
      if (checklistLog.status === 'NÃO VERIFICADO') {
        reportHeader = `[Checklist de Condições Restritivas do Ex-Tarifário: NÃO VERIFICADO - REQUER REVISÃO ESPECIALISTA]\n${checklistFormattedReport}\n\n`
      } else {
        reportHeader = `[Checklist de Condições Restritivas do Ex-Tarifário: HOMOLOGADO]\n${checklistFormattedReport}\n\n`
      }
      finalJustification = `${reportHeader}${finalJustification}`
    }

    // Se o veto de Ex foi aplicado, o Ex final NUNCA pode carregar valor de Ex vetado
    const finalRecommendationEx = exVetoApplied ? '' : primaryTaxRate.ex || recommendedExClean || ''
    const finalHasEx = exVetoApplied ? false : hasEx && Boolean(finalRecommendationEx)

    // REGENERAÇÃO ESTRITA DA FUNDAMENTAÇÃO LEGAL (legal_basis):
    // Proibido herdar referência a Ex remoto, vetado ou diferente do Ex final homologado.
    // Verificação em código: nenhum código de Ex citado no legal_basis pode diferir do Ex final.
    const finalExCode = finalRecommendationEx.toString().trim()
    let regeneratedLegalBasis = {
      ...(llmResponseJson.legal_basis || primaryTaxRate.legal_basis || {}),
    }

    const rawNotes = (regeneratedLegalBasis.notes || '').toString()
    // Procurar menções a Ex-Tarifário na nota
    const exMentionMatch = rawNotes.match(/ex(?:-tarif[aá]rio)?\s*[:#-]?\s*(\d{1,4})/i)

    if (exMentionMatch) {
      const citedExDigits = exMentionMatch[1].padStart(3, '0')
      const finalExDigits = finalExCode ? finalExCode.padStart(3, '0') : ''

      if (!finalExCode || citedExDigits !== finalExDigits) {
        // Ex citado difere do Ex final: REGENERAR notes por completo sem a menção ao Ex vetado/incompatível
        const cleanedNotes = rawNotes
          .replace(/conforme\s+descrito\s+no\s+ex-tarif[aá]rio\s*\d+/gi, '')
          .replace(/com\s+ex-tarif[aá]rio\s*\d+/gi, '')
          .replace(/ex-tarif[aá]rio\s*\d+/gi, '')
          .replace(/\s{2,}/g, ' ')
          .replace(/\s*\.\s*\./g, '.')
          .trim()

        regeneratedLegalBasis.notes =
          cleanedNotes && cleanedNotes.length > 5
            ? cleanedNotes
            : `Classificação determinada pela função essencial na NCM ${recommendedNcmClean} (${regeneratedLegalBasis.regime || 'Geral'}), sem Ex-Tarifário concedido.`
      }
    } else if (!finalExCode && /ex-tarif[aá]rio/i.test(rawNotes)) {
      regeneratedLegalBasis.notes = `Classificação na NCM ${recommendedNcmClean} com base nas Regras Gerais de Interpretação (RGI 1 / RGI 3). Sem aplicação de Ex-Tarifário.`
    }

    // =========================================================================
    // VARREDURA UNIVERSAL EM CASCATA DE MENÇÕES ÓRFÃS DE NCM/EX (INVARIANTE)
    // =========================================================================
    // Todo código NCM de 8 dígitos ou fragmento hierárquico (ex: 90319090, 9031.90.90, 9031)
    // ou menção de Ex pertencentes a candidatos vetados ou que não coincidam com o NCM/Ex final homologado
    // (ou com a própria linha da alternativa em que aparece) devem ser suprimidos/substituídos por
    // referência canônica neutra à função essencial do produto.

    // 1. Limpeza profunda em recommendation.justification
    finalJustification = sanitizeOrphanNcmReferences({
      text: finalJustification,
      allowedNcm: recommendedNcmClean,
      allowedEx: finalRecommendationEx,
      vetoedNcms,
      essentialFunction: initialRecommendation.essential_function || 'aparelho com função própria',
    })

    // 2. Limpeza profunda em recommendation.legal_basis.notes
    if (regeneratedLegalBasis.notes) {
      regeneratedLegalBasis.notes = sanitizeOrphanNcmReferences({
        text: String(regeneratedLegalBasis.notes),
        allowedNcm: recommendedNcmClean,
        allowedEx: finalRecommendationEx,
        vetoedNcms,
        essentialFunction:
          initialRecommendation.essential_function || 'aparelho com função própria',
      })
    }

    // 3. Limpeza profunda em alternatives[].reason e alternatives[].description
    for (const alt of resolvedAlternatives) {
      if (alt.reason) {
        alt.reason = sanitizeOrphanNcmReferences({
          text: String(alt.reason),
          allowedNcm: alt.ncm,
          allowedEx: alt.ex || '',
          vetoedNcms,
          essentialFunction:
            initialRecommendation.essential_function || 'aparelho com função própria',
        })
      }
      if (alt.description) {
        alt.description = sanitizeOrphanNcmReferences({
          text: String(alt.description),
          allowedNcm: alt.ncm,
          allowedEx: alt.ex || '',
          vetoedNcms,
          essentialFunction:
            initialRecommendation.essential_function || 'aparelho com função própria',
        })
      }
    }

    const recommendationObject = {
      ncm: recommendedNcmClean,
      ex: finalRecommendationEx,
      description: primaryDescription,
      ii: iiRate,
      ipi: ipiRate,
      pis: pisRate,
      cofins: cofinsRate,
      total_tax: totalTax,
      has_ex_tarifario: finalHasEx,
      justification: finalJustification,
      legal_basis: regeneratedLegalBasis,
      ex_details: finalHasEx ? exDetails : null,
    }

    // Formatar string combinada com as duas passadas
    // Ex: "openai (gpt-4o-mini) + deepseek (deepseek-chat)"
    const compositeModelUsed = auditorModelUsed
      ? `${analystModelUsed} + ${auditorModelUsed}`
      : analystModelUsed

    // =========================================================================
    // CORREÇÃO (4) — LOG COMPLETO DE CANDIDATOS AVALIADOS (AUDITORIA FUTURA)
    // =========================================================================
    // Gravar no log imp_sim_ncm_classification_log (payload agent_suggestion)
    // a lista completa de candidatos avaliados (NCM, Ex, score/direção de recuperação,
    // marcação se veio de expansão de família hierárquica, alíquotas).
    const evaluatedCandidatesLog = candidates.map((c: any) => ({
      ncm: normalizeNcm(c.ncm),
      ex: (c.ex || '').toString().trim(),
      description: c.ncm_descricao_full || c.ncm_descricao || '',
      ex_description: c.ex_descricao || null,
      vector_score: c.vector_score ?? null,
      text_score: c.text_score ?? null,
      combined_score: c.combined_score ?? null,
      ii_rate: c.ii_rate ?? null,
      ipi_rate: c.ipi_rate ?? null,
      pis_rate: c.pis_rate ?? null,
      cofins_rate: c.cofins_rate ?? null,
      is_family_expansion: Boolean(c.is_family_expansion),
      expansion_parent_6: c.expansion_parent_6 || null,
      is_component_sector: Boolean(c.is_component_sector),
      is_target_machine_parts: Boolean(c.is_target_machine_parts),
    }))

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
              model_used: compositeModelUsed,
              analyst_model: analystModelUsed,
              auditor_model: auditorModelUsed || 'none',
              product_understanding: finalProductUnderstanding,
              brand,
              model,
              additional_specs: additionalSpecs,
              lean_signature: leanSignature,
              initial_recommendation: initialRecommendation,
              audit_verdict: auditVerdict,
              composition_analysis: compositionAnalysis,
              checklist_log: checklistLog,
              ex_veto_applied: exVetoApplied,
              evaluated_candidates: evaluatedCandidatesLog,
              evaluated_candidates_count: evaluatedCandidatesLog.length,
            },
            final_choice_ncm: recommendedNcmClean,
            final_choice_ex: finalRecommendationEx,
            confirmed_by: callerUserId,
            status: 'pendente',
            product_id: productId,
            imp_sim_product_id: impSimProductId,
            audit_links: webSources,
            knowledge_base_version: '3.1',
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

    const responsePayload = {
      success: true,
      audit_id: auditId,
      recommendation: recommendationObject,
      alternatives: resolvedAlternatives,
      product_understanding: finalProductUnderstanding,
      confidence: (llmResponseJson.confidence || 'media').toLowerCase(),
      sufficient_info: sufficiencyCheck.isSufficient,
      web_sources: webSources,
      model_used: compositeModelUsed,
      analyst_model: analystModelUsed,
      auditor_model: auditorModelUsed,
      candidates_count: candidates.length,
      evaluated_candidates: evaluatedCandidatesLog,
      execution_time_ms: executionTimeMs,
      audit_verdict: auditVerdict,
      lean_signature: leanSignature,
      composition_analysis: compositionAnalysis,
      checklist_log: checklistLog,
      version: '3.3.0-build.605',
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
 * Avaliação canônica de isKit para a composição (Fase 0):
 * Regra: isKit é TRUE SOMENTE quando o produto é comercializado como conjunto de múltiplos itens
 * fisicamente autônomos que operam juntos (ex.: transmissor + receptor no sistema de microfone sem fio),
 * NUNCA para aparelho singular com botões/joystick/periféricos integrados (ex.: Sony RM-IP500).
 */
function evaluateCanonicalIsKit(params: {
  productUnderstanding?: any
  productText: string
  initialDetectedComponents: string[]
}): boolean {
  const pu = params.productUnderstanding || {}
  const identity = String(pu.identity || '').toLowerCase()
  const essentialFunction = String(pu.essential_function || '').toLowerCase()
  const rawText = params.productText.toLowerCase()

  // Se a identidade ontológica declara um aparelho unitário singular
  const singularUnitPatterns = [
    /\b(controlador|controller|painel|mesa|console|c[aâ]mera|camcorder|conversor|gravador|monitor|switch|roteador|aparelho individual|dispositivo singular)\b/i,
  ]
  const isSingularIdentity = singularUnitPatterns.some((pat) => pat.test(identity))

  // Se for explicitamente par transmissor + receptor autônomos
  const hasAutonomousTxRxPair =
    (/\b(transmissor|transmitter|bodypack|utx|tx)\b/i.test(rawText) &&
      /\b(receptor|receiver|urx|rx)\b/i.test(rawText)) ||
    /\b(transmissor\s*\+\s*receptor|transmitter\s+and\s+receiver|sistema\s+sem\s+fio\s+completo)\b/i.test(
      rawText,
    )

  if (hasAutonomousTxRxPair) {
    return true
  }

  // Se a identidade for expressamente singular (ex: controlador remoto), NUNCA é kit
  if (isSingularIdentity) {
    return false
  }

  // Se o próprio product_understanding declarou is_kit_or_system
  if (pu.is_kit_or_system === true || pu.is_kit === true) {
    return true
  }

  // Itens autônomos múltiplos explícitos
  return false
}

/**
 * Varredura Universal de Menções Órfãs de NCM/Ex (Princípio Genérico):
 * Elimina referências textuais a NCMs vetados (ex: 9031, 90319090, 9031.90.90) ou Ex vetados
 * de justificativas, notas legais e razões de alternativas, substituindo por referências canônicas neutras.
 */
function sanitizeOrphanNcmReferences(params: {
  text: string
  allowedNcm: string
  allowedEx?: string
  vetoedNcms: Set<string>
  essentialFunction: string
}): string {
  let result = params.text || ''
  if (!result) return ''

  const allowedClean = normalizeNcm(params.allowedNcm)
  const allowedExClean = (params.allowedEx || '').toString().trim()
  const vetoedSet = params.vetoedNcms

  // 1. Substituir menções diretas a NCMs vetados (com ou sem pontuação)
  for (const vetoed of vetoedSet) {
    if (!vetoed || vetoed === allowedClean) continue

    // Formatos: 90319090, 9031.90.90, 9031.90, 9031
    const ncm8 = vetoed
    const ncmFormatted = `${vetoed.slice(0, 4)}.${vetoed.slice(4, 6)}.${vetoed.slice(6, 8)}`
    const ncmPos = vetoed.slice(0, 4)
    const ncmPosFormatted = `${vetoed.slice(0, 2)}.${vetoed.slice(2, 4)}`

    // Veto explícito de 8 dígitos
    const regex8 = new RegExp(`(?:ncm\\s*)?(?:${ncm8}|${ncmFormatted.replace(/\./g, '\\.')})`, 'gi')
    result = result.replace(regex8, `posição fiscal correspondente à função essencial`)

    // Veto de menções que citam especificamente a posição vetada como recomendada
    // Ex: "A classificação recomendada é NCM 90319090" -> "A classificação recomendada é NCM ${allowedClean}"
    const recRegex = new RegExp(
      `(?:classifica[cç][aã]o recomendada [eé] (?:a )?NCM\\s*)(?:${ncm8}|${ncmFormatted.replace(/\./g, '\\.')})`,
      'gi',
    )
    result = result.replace(recRegex, `classificação recomendada é NCM ${allowedClean}`)
  }

  // 2. Varrer qualquer NCM de 8 dígitos presente no texto que NÃO SEJA o NCM permitido
  // e que pertença aos capítulos regulados (84, 85, 90) caso não coincida
  const anyNcm8Regex = /\b(\d{4})\.?(\d{2})\.?(\d{2})\b/g
  result = result.replace(anyNcm8Regex, (match, p1, p2, p3) => {
    const rawDigits = `${p1}${p2}${p3}`
    if (rawDigits === allowedClean) {
      return match
    }
    // Se for NCM diferente do permitido e vetado
    if (vetoedSet.has(rawDigits) || vetoedSet.has(rawDigits.slice(0, 4))) {
      return 'posição fiscal correspondente'
    }
    return match
  })

  // 3. Suprimir menções órfãs a "Fundamentação Complementar:" que perpetuem argumentos de NCM vetado
  // Se o trecho de "Fundamentação Complementar" mencionar posição vetada ou afirmar recomendação oposta
  result = result.replace(
    /Fundamenta[cç][aã]o Complementar:\s*A classifica[cç][aã]o recomendada [eé].*?(?=(?:\n\n|$))/gis,
    '',
  )

  // 4. Se não há Ex permitido, suprimir qualquer menção a Ex vetado (ex: "com Ex 247", "Ex-Tarifário 019")
  if (!allowedExClean) {
    result = result
      .replace(/conforme\s+descrito\s+no\s+ex-tarif[aá]rio\s*\d+/gi, '')
      .replace(/com\s+ex-tarif[aá]rio\s*\d+/gi, '')
      .replace(/ex-tarif[aá]rio\s*\d+/gi, '')
      .replace(/\[Checklist de Condições Restritivas do Ex-Tarifário:[^\]]+\]\s*/gi, '')
  }

  // 5. Normalizar espaços múltiplos e pontuação duplicada
  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*\.\s*\./g, '.')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim()

  return result
}

/**
 * Análise de Composição Universal (RGI 3b/3c):
 * Identifica se qualquer produto fornecido é um sistema, conjunto, sortido ou kit com múltiplos componentes.
 * REGRA VINCULANTE (Princípio Genérico):
 * Componentes listados na análise de composição DEVEM ser citados TEXTUALMENTE na descrição/especificações do produto (verbatim).
 * Componente que não aparece explicitamente no texto NÃO pode ser afirmado.
 * Expressões descritivas de uso ou montagem (ex: "camera-mount", "para câmera", "for camera", "camera mount",
 * "rack mount", "pole mount", "shoe mount") indicam montagem/acessório ou compatibilidade, NUNCA a presença do aparelho como componente.
 */
function analyzeProductComposition(text: string): CompositionAnalysisResult {
  if (!text)
    return {
      isKit: false,
      detectedComponents: [],
      compositionIdentified: false,
      targetMachines: [],
    }
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

  // Identificação genérica de Máquinas de Destino da Função (conectivos de finalidade e modificadores de montagem)
  // Conectivos: "para", "destinado a", "destina-se a", "indicado para", "apropriado para", "for", "designed for", "compatible with", "control of", "uso em"
  const targetMachines: string[] = []
  const destinationPatterns = [
    /(?:para|destinado\s+a|destina-se\s+a|apropriad[ao]\s+para|indicad[ao]\s+para|compat[ií]vel\s+com|controle\s+d[aeo]s?|uso\s+em)\s+([a-záàâãéèêíïóôõöúçñ0-9\s-]{2,50})/gi,
    /(?:for|intended\s+for|suitable\s+for|compatible\s+with|designed\s+for|control\s+of)\s+([a-z0-9\s-]{2,50})/gi,
  ]

  for (const pat of destinationPatterns) {
    let match: RegExpExecArray | null
    while ((match = pat.exec(text)) !== null) {
      const phrase = match[1]
        .split(/[,.;/()–—\n\r]|(?:\b(?:with|com|and|e|de|do|da|including|incluindo)\b)/i)[0]
        .trim()
      if (phrase && phrase.length >= 3 && phrase.length <= 50) {
        targetMachines.push(phrase)
      }
    }
  }

  // Modificadores de montagem ("-mount", "-mounted", "-mountable") identificam acoplamento/máquina de destino, não componente
  const mountMatches = text.matchAll(/\b([a-z0-9]+)-(?:mount|mounted|mountable)\b/gi)
  for (const m of mountMatches) {
    const rawMount = m[1].toLowerCase()
    if (rawMount !== 'rack' && rawMount !== 'pole' && rawMount !== 'wall' && rawMount !== 'shoe') {
      targetMachines.push(m[1])
    }
  }

  // Normalização e deduplicação de máquinas de destino (descartar fragmentos triviais/recortes de marketing)
  const trivialMarketingFragments = new Set([
    'the',
    'an',
    'a',
    'all',
    'any',
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'uns',
    'umas',
    'pro',
    'professional',
    'broadcast',
    'studio',
    'production',
    'live',
    'high',
    'ultra',
    'todas',
    'todos',
    'todo',
    'toda',
    'seu',
    'sua',
    'seus',
    'suas',
    'cada',
    'mais',
    'melhor',
  ])

  const uniqueTargets = Array.from(
    new Set(
      targetMachines
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 3 && !trivialMarketingFragments.has(t) && !/^\d+$/.test(t)),
    ),
  )

  // Criar cópia do texto com conectivos de finalidade e modificadores de montagem REMOVIDOS
  // Componente só entra se estiver citado textualmente FORA de conectivos de finalidade e fora de modificadores "-mount"
  let textForComponents = text
  const cleaningRegexes = [
    /\b[a-z0-9]+-(?:mount|mounted|mountable)\b/gi,
    /\b(?:camera|shoe|rack|pole|wall)\s+mount\b/gi,
    /(?:para|destinado\s+a|destina-se\s+a|apropriad[ao]\s+para|indicad[ao]\s+para|compat[ií]vel\s+com|controle\s+d[aeo]s?|uso\s+em)\s+[^\n\r,.;]+/gi,
    /(?:for|intended\s+for|suitable\s+for|compatible\s+with|designed\s+for|control\s+of)\s+[^\n\r,.;]+/gi,
  ]
  for (const cr of cleaningRegexes) {
    textForComponents = textForComponents.replace(cr, ' ')
  }

  // Detecção estrita e verbatim de componentes físicos integrados do produto
  const detected: string[] = []

  // 1. Transmissor
  const txMatch = textForComponents.match(
    /\b(transmissor(?:a|es)?|transmitter(?:s)?|bodypack|plug-on)\b/i,
  )
  if (txMatch) {
    detected.push(txMatch[0])
  }

  // 2. Receptor
  const rxMatch = textForComponents.match(
    /\b(receptor(?:a|es)?|receiver(?:s)?|base sintonizadora)\b/i,
  )
  if (rxMatch) {
    detected.push(rxMatch[0])
  }

  // 3. Microfone / Cápsula
  const micMatch = textForComponents.match(
    /\b(microfone(?:s)?|microphone(?:s)?|lavalier|lapela|headset)\b/i,
  )
  if (micMatch) {
    detected.push(micMatch[0])
  }

  // 4. Controlador / Console
  const ctrlMatch = textForComponents.match(
    /\b(controlador(?:es)?|controller(?:s)?|console(?:s)?|joystick(?:s)?)\b/i,
  )
  if (ctrlMatch) {
    detected.push(ctrlMatch[0])
  }

  // 5. Câmera: só entra como componente se sobrou no texto LIMPO (ou seja, quando NÃO é destino da função)
  const cameraMatch = textForComponents.match(/\b(c[aâ]mera(?:s)?|camcorder(?:s)?)\b/i)
  if (cameraMatch) {
    detected.push(cameraMatch[0])
  }

  // 6. Fonte / Alimentação / Bateria
  const psuMatch = textForComponents.match(
    /\b(power supply|fonte de alimenta[cç][aã]o|carregador(?:es)?|bateria(?:s)?|battery)\b/i,
  )
  if (psuMatch) {
    detected.push(psuMatch[0])
  }

  // 7. Lente / Óptica
  const lensMatch = textForComponents.match(/\b(lente(?:s)?|lens(?:es)?|[oó]ptica)\b/i)
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
    targetMachines: uniqueTargets,
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

  // Invariante obrigatória do Checklist (Princípio Genérico):
  // status "NÃO VERIFICADO" ou qualquer status que não seja "APROVADO" implica passed: false.
  // Sincronizar o flag passed com o status em código para qualquer status que não seja comprovado/verificado.
  let checklistStatus: 'APROVADO' | 'VETADO' | 'NÃO VERIFICADO' = 'APROVADO'
  let requiresExpertReview = false

  if (comparisons.length === 0) {
    checklistStatus = 'NÃO VERIFICADO'
    requiresExpertReview = true
    needsWebSearch = true
    missingInformation.push(
      'qualificadores técnicos do Ex-Tarifário não puderam ser extraídos automaticamente',
    )
    comparisons.push({
      name: 'Verificação de Qualificadores do Ex-Tarifário',
      productValue: 'Especificações técnicas gerais do produto',
      exRequirement:
        'Condições do Ex-Tarifário (texto descritivo complexo ou sem qualificadores tabulados)',
      status: 'NÃO COMPROVADO',
      reason:
        'Extração automática vazia de qualificadores do Ex. Requer revisão especialista humana.',
    })
  } else if (!passed) {
    checklistStatus = 'VETADO'
  } else if (comparisons.some((c) => c.status === 'NÃO COMPROVADO')) {
    needsWebSearch = true
    checklistStatus = 'NÃO VERIFICADO'
    requiresExpertReview = true
  }

  // Sincronização estrita da invariante:
  // Se o status for NÃO VERIFICADO ou VETADO, passed DEVE ser false.
  const finalPassed = checklistStatus === 'APROVADO' && passed

  return {
    passed: finalPassed,
    status: checklistStatus,
    requiresExpertReview,
    comparisons,
    vetoReason: vetoReason || undefined,
    missingInformation,
    needsWebSearch,
  }
}

/**
 * Confronta a descrição hierárquica completa do candidato com a natureza do produto.
 * Princípio genérico: Veta qualquer candidato cuja descrição afirme que o produto é de uma natureza
 * ontológica que o produto não possui (ex: candidato descreve câmera para um controlador/remoto/periférico;
 * candidato descreve aparelho de áudio para cabo; candidato descreve monitor para lente).
 */
function checkNatureContradiction(params: {
  productText: string
  candidateDesc: string
  detectedComponents: string[]
}): { contradicted: boolean; reason?: string } {
  const prodTextLower = params.productText.toLowerCase()
  const candDescLower = params.candidateDesc.toLowerCase()

  // 1. Caso: Produto é periférico de controle / comando / remoto / joystick
  const isControllerOrPeripheral =
    /\b(controlador|controller|controle remoto|remote control|joystick|console de controle|mesa de controle|painel de controle)\b/i.test(
      prodTextLower,
    )

  // Substantivo "câmera" ou "câmeras" como natureza autônoma (não apenas de interface)
  // Ex: 90071000 descreve "Câmeras cinematográficas..." ou "Câmeras de vídeo digital..."
  const candIsDirectlyCamera =
    /\b(c[aâ]meras?(?: de v[ií]deo| cinematogr[aá]ficas?| digitais?| fotogr[aá]ficas?)?)\b/i.test(
      candDescLower,
    ) &&
    !/\b(partes|acess[oó]rios|comandos?|control|painel|console)\b/i.test(candDescLower) &&
    (candDescLower.startsWith('câmera') ||
      candDescLower.startsWith('camera') ||
      candDescLower.includes('câmeras cinematográficas') ||
      candDescLower.includes('câmeras de televisão') ||
      candDescLower.includes('câmeras fotográficas'))

  if (isControllerOrPeripheral && candIsDirectlyCamera) {
    return {
      contradicted: true,
      reason: `Contradição de natureza ontológica: o produto é um dispositivo periférico/controlador remoto, mas o candidato NCM descreve diretamente o aparelho de captura ("${params.candidateDesc.slice(0, 100)}..."), violando o princípio da função essencial.`,
    }
  }

  // 1.B Caso: Controlador remoto periférico classificado como quadro/painel/console de distribuição elétrica industrial (8537)
  // ou projetor/câmera cinematográfica (9007) ou instrumentos ópticos de medição (9031)
  const isElectricalSwitchboardOrCinematographicOrMeasurement =
    /\b(quadros?, pain[eé]is, consoles, cabinas|distribui[cç][aã]o de energia|cinematogr[aá]fic[ao]s|aparelhos e instrumentos de medida|perfil[oó]metros|ópticos de medida)\b/i.test(
      candDescLower,
    )
  if (isControllerOrPeripheral && isElectricalSwitchboardOrCinematographicOrMeasurement) {
    return {
      contradicted: true,
      reason: `Contradição de natureza ontológica: o produto é um controlador remoto eletrônico/digital, incompatível com aparelhos de distribuição elétrica pesada (8537), cinematográficos (9007) ou medição óptica (9031).`,
    }
  }
  // 2. Caso: Produto é transmissor/receptor/microfone de áudio, mas o candidato descreve diretamente câmera/óptica
  const isAudioDevice =
    /\b(microfone|microphone|transmissor de [aá]udio|receptor de [aá]udio|headset|lapela|lavalier)\b/i.test(
      prodTextLower,
    )
  if (isAudioDevice && candIsDirectlyCamera) {
    return {
      contradicted: true,
      reason: `Contradição de natureza: o produto é equipamento de áudio/acústico, mas o candidato descreve aparelho de filmagem/câmera.`,
    }
  }

  // 3. Caso: Aparelho eletroeletrônico classificado em máquinas mecânicas pesadas de elevação/construção
  const isElectronicDevice =
    /\b(eletr[oô]nico|digital|ip|visca|rs-422|rs422|ethernet|hdmi|usb|sem fio|wireless)\b/i.test(
      prodTextLower,
    )
  const candIsHeavyMachinery =
    /\b(guindastes?|pontes rolantes|gruas|talhas|empilhadeiras?|aparelhos de eleva[cç][aã]o ou de carga)\b/i.test(
      candDescLower,
    )
  if (isElectronicDevice && candIsHeavyMachinery) {
    return {
      contradicted: true,
      reason: `Contradição setorial: aparelho eletroeletrônico/digital classificado em máquinas pesadas de movimentação/elevação do Cap. 84.`,
    }
  }

  return { contradicted: false }
}

/**
 * Verifica se a justificativa da auditoria fundamentou a escolha em vantagens tributárias (alíquota / II 0%),
 * o que é expressamente proibido pela regra vinculante.
 */
function checkTaxAdvantageCriterion(params: {
  auditCritique?: string
  correctionReason?: string
  initialCandidate?: any
  correctedCandidate?: any
}): { violatesTaxProhibition: boolean; reason?: string } {
  const combinedText =
    `${params.auditCritique || ''} ${params.correctionReason || ''}`.toLowerCase()

  // Termos explícitos de fundamentação tributária como motivo
  const taxAdvantageKeywords = [
    /\b(al[ií]quota (?:zero|menor|mais vantajosa|reduzida|benef[ií]cio))\b/i,
    /\b(ii\s*(?:de\s*)?0%|ii\s*=\s*0%|imposto de importa[cç][aã]o zero)\b/i,
    /\b(vantagem (?:fiscal|tribut[aá]ria))\b/i,
    /\b(redu[cç][aã]o forte de carga)\b/i,
    /\b(ex-tarif[aá]rio vantajoso|ex vantajoso)\b/i,
    /\b(menor carga tribut[aá]ria|economia de impostos)\b/i,
  ]

  const hasTaxMotivator = taxAdvantageKeywords.some((pattern) => pattern.test(combinedText))

  if (hasTaxMotivator) {
    return {
      violatesTaxProhibition: true,
      reason:
        'A auditoria utilizou alíquota ou vantagem tributária (II 0% / Ex vantajoso) como critério de escolha ou justificativa, o que é expressamente vedado pelas regras de enquadramento técnico.',
    }
  }

  return { violatesTaxProhibition: false }
}

/**
 * Seleciona a melhor alternativa de fallback entre candidatos, aplicando o princípio de:
 * "Preferir família de função genérica compatível (máquinas/aparelhos com função própria, partes e acessórios)
 * sobre a de função específica incompatível."
 */
function selectBestCompatibleFallback(params: {
  candidates: any[]
  rejectedNcms: string[]
  productText: string
  detectedComponents: string[]
}): any | null {
  const { candidates, rejectedNcms, productText, detectedComponents } = params
  const rejectedSet = new Set(rejectedNcms.map((n) => normalizeNcm(n)))

  // Filtrar apenas candidatos que não foram explicitamente rejeitados
  const eligibleCandidates = candidates.filter((c: any) => !rejectedSet.has(normalizeNcm(c.ncm)))

  if (eligibleCandidates.length === 0) return null

  // Pontuar candidatos por compatibilidade técnica
  const scored = eligibleCandidates.map((cand: any) => {
    let score = cand.combined_score ?? 0
    const ncmClean = normalizeNcm(cand.ncm)
    const desc = (
      cand.ncm_descricao_full ||
      cand.ncm_descricao ||
      cand.source_text ||
      ''
    ).toLowerCase()

    // 1. Elimina contradição de natureza
    const check = checkNatureContradiction({
      productText,
      candidateDesc: desc,
      detectedComponents,
    })
    if (check.contradicted) {
      score -= 100 // Fortemente penalizado
    }

    // 2. Bonifica famílias de função genérica compatível para aparelhos de controle/eletroeletrônicos
    // Família 8543 (máquinas e aparelhos elétricos com função própria)
    if (ncmClean.startsWith('8543')) {
      score += 25
    }
    // Família 8529 (partes reconhecíveis como exclusiva ou principalmente destinadas aos aparelhos das posições 85.25 a 85.28)
    if (ncmClean.startsWith('8529')) {
      score += 20
    }
    // Família 8518 (aparelhos de áudio) se for produto de áudio
    if (ncmClean.startsWith('8518') && /\b(microfone|audio|som)\b/i.test(productText)) {
      score += 30
    }

    // Penaliza capítulos sabidamente distantes da natureza eletroeletrônica quando o produto é eletrônico
    if (
      ncmClean.startsWith('8426') ||
      ncmClean.startsWith('8428') ||
      ncmClean.startsWith('9007') ||
      ncmClean.startsWith('8537') ||
      ncmClean.startsWith('9031')
    ) {
      score -= 50
    }

    return { candidate: cand, score }
  })

  scored.sort((a, b) => b.score - a.score)

  if (scored[0] && scored[0].score > -50) {
    return scored[0].candidate
  }

  return null
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
  targetMachines?: string[]
  topN: number
}): Promise<any[]> {
  const {
    supabaseAdmin,
    query,
    queryEmbedding,
    topN,
    detectedComponents = [],
    targetMachines = [],
  } = params

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

  // Se componentes foram detectados verbatim na análise de composição (ex: microfone, receptor, transmissor, console),
  // realizar busca direta no banco de posições fiscais que contemplem esses termos textualmente
  // para garantir que a família correspondente à assinatura/componente do produto entre priorizada
  if (detectedComponents.length > 0) {
    try {
      const distinctComps = Array.from(
        new Set(
          detectedComponents
            .map((comp) => comp.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
            .filter((c) => c.length >= 4 && !['sistema', 'conjunto', 'para', 'com'].includes(c)),
        ),
      ).slice(0, 3)

      for (const cleanComp of distinctComps) {
        // Buscar posições oficiais no banco contendo o termo verbatim diretamente via índice GIN em ncm_descricao_full
        const { data: compMatches } = await supabaseAdmin
          .from('imp_sim_tax_rates')
          .select(
            'id, ncm, ex, ncm_descricao, ncm_descricao_full, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
          )
          .ilike('ncm_descricao_full', `%${cleanComp}%`)
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
                ncm_descricao_full: m.ncm_descricao_full || m.ncm_descricao || '',
                ex_descricao: m.ex_descricao || null,
                source_text: `NCM ${m.ncm} | ${m.ncm_descricao_full || m.ncm_descricao || ''}${m.ex_descricao ? ` | Ex ${m.ex} ${m.ex_descricao}` : ''}`,
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

  // RECUPERAÇÃO DA FAMÍLIA DE PARTES E ACESSÓRIOS DA MÁQUINA DE DESTINO (Princípio Genérico):
  // Se uma máquina de destino da função foi identificada (padrão "X para Y" / modificadores de montagem),
  // acionar a busca da família de partes e acessórios correspondente àquela máquina via mapeamento SEMÂNTICO no banco
  // (consultando descrições hierárquicas por posições de destino e suas partes/acessórios, sem códigos hardcoded).
  // Localizar as posições cuja ncm_descricao_full se declara servirem às posições que abrangem aquela máquina
  // (ex.: 8529 se declara "partes e acessórios ... aos aparelhos das posições 85.24 a 85.28", que inclui câmeras da 85.25).
  if (targetMachines.length > 0) {
    try {
      const distinctTargets = Array.from(
        new Set(
          targetMachines
            .flatMap((t) => t.toLowerCase().split(/[\s-]+/))
            .filter(
              (w) =>
                (w.length >= 4 &&
                  !['para', 'com', 'destinado', 'apropriado', 'cameras', 'camera'].includes(w)) ||
                w.startsWith('camer') ||
                w.startsWith('câmer') ||
                w === 'ptz',
            ),
        ),
      ).slice(0, 4)

      // 1. Identificar posições da máquina de destino no banco
      const targetHeadings = new Set<string>()
      for (const targetWord of distinctTargets) {
        const { data: targetPositions } = await supabaseAdmin
          .from('imp_sim_tax_rates')
          .select('ncm')
          .ilike('ncm_descricao_full', `%${targetWord}%`)
          .limit(10)

        if (targetPositions && targetPositions.length > 0) {
          for (const tp of targetPositions) {
            const h = (tp.ncm || '').slice(0, 4)
            if (h && h.length === 4) targetHeadings.add(h)
          }
        }
      }

      // 2. Para cada posição encontrada (ex: 8525), procurar posições de partes/acessórios
      // que cobrem essa posição, seja por menção direta (85.25) ou por faixa de posições (85.24 a 85.28 / 85.18 a 85.21 / etc.)
      for (const heading of targetHeadings) {
        const headNum = parseInt(heading, 10)
        const formattedHeading = `${heading.slice(0, 2)}.${heading.slice(2, 4)}` // ex: 85.25

        // Buscar posições cujas descrições contenham partes/acessórios
        const { data: partsCandidates } = await supabaseAdmin
          .from('imp_sim_tax_rates')
          .select(
            'id, ncm, ex, ncm_descricao, ncm_descricao_full, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
          )
          .ilike('ncm_descricao_full', '%partes%posiç%')
          .limit(30)

        if (partsCandidates && partsCandidates.length > 0) {
          for (const pc of partsCandidates) {
            const desc = pc.ncm_descricao_full || ''
            let matchesHeadingScope = false

            // Verifica menção direta da posição
            if (desc.includes(formattedHeading) || desc.includes(heading)) {
              matchesHeadingScope = true
            } else {
              // Verifica faixas de posições no padrão "85.24 a 85.28" ou "84.25 a 84.30"
              const rangeRegex = /(\d{2})\.(\d{2})\s*(?:a|à|-|to)\s*(\d{2})\.(\d{2})/g
              let rangeMatch: RegExpExecArray | null
              while ((rangeMatch = rangeRegex.exec(desc)) !== null) {
                const startNum = parseInt(`${rangeMatch[1]}${rangeMatch[2]}`, 10)
                const endNum = parseInt(`${rangeMatch[3]}${rangeMatch[4]}`, 10)
                if (!isNaN(headNum) && headNum >= startNum && headNum <= endNum) {
                  matchesHeadingScope = true
                  break
                }
              }
            }

            if (matchesHeadingScope) {
              const alreadyExists = candidates.some(
                (c: any) => normalizeNcm(c.ncm) === pc.ncm && (c.ex || '') === (pc.ex || ''),
              )
              if (!alreadyExists) {
                candidates.push({
                  tax_rate_id: pc.id,
                  ncm: pc.ncm,
                  ex: pc.ex || '',
                  ncm_descricao: pc.ncm_descricao || '',
                  ncm_descricao_full: pc.ncm_descricao_full || pc.ncm_descricao || '',
                  ex_descricao: pc.ex_descricao || null,
                  source_text: `NCM ${pc.ncm} | ${pc.ncm_descricao_full || pc.ncm_descricao || ''}${pc.ex_descricao ? ` | Ex ${pc.ex} ${pc.ex_descricao}` : ''}`,
                  ii_rate: Number(pc.ii_efetivo ?? pc.ii_rate ?? 0),
                  ipi_rate: Number(pc.ipi_rate ?? 0),
                  pis_rate: Number(pc.pis_rate ?? 2.1),
                  cofins_rate: Number(pc.cofins_rate ?? 9.65),
                  has_ex_tarifario: Boolean(pc.has_ex_tarifario),
                  vector_score: 0.75,
                  text_score: 0.95,
                  combined_score: 0.85,
                  is_target_machine_parts: true,
                })
              }
            }
          }
        }
      }
    } catch (targetErr) {
      console.warn(
        'Falha na busca determinística da família de partes/acessórios da máquina de destino:',
        targetErr,
      )
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

  const selectedCandidates = diversifiedCandidates.slice(0, topN)

  // =========================================================================
  // CORREÇÃO (1) — EXPANSÃO DE FAMÍLIA HIERÁRQUICA (PRINCÍPIO GENÉRICO UNIVERSAL)
  // =========================================================================
  // Sempre que um NCM de 8 dígitos entrar como candidato na recuperação,
  // incluir OBRIGATORIAMENTE todas as subposições irmãs do mesmo ramo hierárquico
  // (mesmos 6 primeiros dígitos) presentes na base imp_sim_tax_rates, mesmo que
  // fiquem acima do limite de candidatos por similaridade (topN).
  try {
    const candidatePrefixes6 = new Set<string>()
    for (const c of selectedCandidates) {
      const ncm8 = normalizeNcm(c.ncm)
      if (ncm8 && ncm8.length === 8) {
        candidatePrefixes6.add(ncm8.slice(0, 6))
      }
    }

    if (candidatePrefixes6.size > 0) {
      for (const prefix6 of candidatePrefixes6) {
        const { data: siblingRows, error: sibError } = await supabaseAdmin
          .from('imp_sim_tax_rates')
          .select(
            'id, ncm, ex, ncm_descricao, ncm_descricao_full, ex_descricao, ii_rate, ipi_rate, pis_rate, cofins_rate, has_ex_tarifario',
          )
          .like('ncm', `${prefix6}%`)

        if (!sibError && siblingRows && siblingRows.length > 0) {
          for (const s of siblingRows) {
            const sNcm = normalizeNcm(s.ncm)
            const sEx = (s.ex || '').toString().trim()
            const exists = selectedCandidates.some(
              (c: any) => normalizeNcm(c.ncm) === sNcm && (c.ex || '').toString().trim() === sEx,
            )
            if (!exists) {
              selectedCandidates.push({
                tax_rate_id: s.id,
                ncm: s.ncm,
                ex: s.ex || '',
                ncm_descricao: s.ncm_descricao || '',
                ncm_descricao_full: s.ncm_descricao_full || s.ncm_descricao || '',
                ex_descricao: s.ex_descricao || null,
                source_text: `NCM ${s.ncm} | ${s.ncm_descricao_full || s.ncm_descricao || ''}${s.ex_descricao ? ` | Ex ${s.ex} ${s.ex_descricao}` : ''}`,
                ii_rate: Number(s.ii_efetivo ?? s.ii_rate ?? 0),
                ipi_rate: Number(s.ipi_rate ?? 0),
                pis_rate: Number(s.pis_rate ?? 2.1),
                cofins_rate: Number(s.cofins_rate ?? 9.65),
                has_ex_tarifario: Boolean(s.has_ex_tarifario),
                vector_score: 0.5,
                text_score: 0.5,
                combined_score: 0.5,
                is_family_expansion: true,
                expansion_parent_6: prefix6,
              })
            }
          }
        }
      }
    }
  } catch (expErr) {
    console.warn('Falha na expansão de família hierárquica (não fatal):', expErr)
  }

  return selectedCandidates
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
  const rawDesc = (params.description || '').trim()

  // Extração de termos de busca derivada da identidade do produto (substantivos do aparelho,
  // termos de função e máquina de destino) com stopwords genéricas — não os 2 primeiros tokens da descrição de marketing
  const genericStopwords = new Set([
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'uns',
    'umas',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'em',
    'no',
    'na',
    'nos',
    'nas',
    'por',
    'pelo',
    'pela',
    'pelos',
    'pelas',
    'com',
    'sem',
    'para',
    'destinado',
    'destinada',
    'destinados',
    'destinadas',
    'e',
    'ou',
    'que',
    'se',
    'the',
    'a',
    'an',
    'and',
    'or',
    'of',
    'in',
    'on',
    'at',
    'by',
    'for',
    'with',
    'without',
    'pro',
    'professional',
    'ultra',
    'high',
    'new',
    'novo',
    'nova',
    'original',
    'versao',
    'version',
  ])

  // Isolar substantivos e termos de função / máquina de destino
  // Remove termos puramente de interface e ruído de cabeamento secundário
  const cleanedDesc = rawDesc
    .replace(/\b(bnc|xlr|hdmi|pin|pins|poe|dc in|rs-422|rs232|rj45|db9|tally|gpio)\b[^\s,.]*/gi, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleanedDesc.split(/\s+/).filter((t) => {
    const low = t.toLowerCase()
    return low.length >= 3 && !genericStopwords.has(low) && !/^\d+$/.test(low)
  })

  // Priorizar termos técnicos (aparelho, função, destino)
  const coreTerms = tokens.slice(0, 10).join(' ')

  const parts: string[] = []
  if (brand && !coreTerms.toLowerCase().includes(brand.toLowerCase())) {
    parts.push(brand)
  }
  if (model && !coreTerms.toLowerCase().includes(model.toLowerCase())) {
    parts.push(model)
  }
  if (coreTerms) {
    parts.push(coreTerms)
  }

  const signature = parts.join(' ').trim()
  return signature || rawDesc
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
    targetMachines: string[]
  }
}): { isSufficient: boolean; reason: string } {
  const desc = params.productDescription.trim()
  const combined = `${desc} ${params.brand} ${params.model} ${params.additionalSpecs}`.trim()

  // 1. Descrição muito curta para construir a identidade básica
  if (desc.length < 25 || combined.length < 35) {
    return {
      isSufficient: false,
      reason:
        'Descrição insuficiente para estabelecer a identidade, função essencial e máquina de destino na Fase 0.',
    }
  }

  // 2. Se o produto apresenta indicadores de conjunto/sistema mas seus componentes essenciais não puderam ser identificados
  if (
    params.compositionAnalysis.isKit &&
    (!params.compositionAnalysis.compositionIdentified ||
      params.compositionAnalysis.detectedComponents.length < 2)
  ) {
    return {
      isSufficient: false,
      reason:
        'Produto reconhecido como sistema/conjunto, mas a composição interna não está totalmente detalhada para fundamentação RGI 3b.',
    }
  }

  // 3. Avaliação da clareza da identidade e função essencial (princípio genérico universal)
  // O texto interno deve conter elementos que permitam extrair o que o produto é (substantivo técnico)
  // e o que ele faz (função operacional ou técnica). Se for apenas código comercial ou jargão de marketing sem detalhamento funcional:
  const words = combined.split(/\s+/).filter((w) => w.length > 2)
  const hasSubstantiveTechnicalDetail = words.length >= 8

  if (!hasSubstantiveTechnicalDetail) {
    return {
      isSufficient: false,
      reason:
        'Informações internas resumidas a fragmentos comerciais sem detalhamento técnico substantivo da função.',
    }
  }

  return {
    isSufficient: true,
    reason: 'Informações internas suficientes para construir o perfil técnico completo na Fase 0.',
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
