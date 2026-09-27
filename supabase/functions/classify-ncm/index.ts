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

  // Cliente admin com service_role para ler tabelas protegidas (ai_providers, efetivas, logs)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  let callerUserId: string | null = null

  // Se a requisição veio com a chave de serviço (ex: chamadas internas/M2M entre sistemas com a mesma infraestrutura)
  if (jwt === serviceRoleKey) {
    // Buscar um admin padrão para atribuir o log
    const { data: defaultUser } = await supabaseAdmin
      .from('customers')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()
    callerUserId = defaultUser?.user_id || null
  } else {
    // Cliente autenticado com o JWT do chamador para verificar identidade de usuário
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    // Importante: em Deno Edge Functions não há sessão local persistida (localStorage).
    // O método auth.getUser() sem parâmetros falha com "Auth session missing!".
    // É obrigatório passar explicitamente o jwt como argumento: auth.getUser(jwt).
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
  const topN = Math.max(5, Math.min(Number(body.top_n) || 15, 30))
  const saveLog = body.save_log !== false
  const productId = body.product_id || null
  const impSimProductId = body.imp_sim_product_id || null

  try {
    // 4. Construir Assinatura Enxuta do Produto para a busca de candidatos NCM
    // REQUISITO (2): Não concatenar o blob de specs (conectores XLR/BNC/pinos) na busca/embedding de candidatos,
    // pois isso domina a similaridade de cosseno e enterra a função essencial do equipamento.
    // Usar: Marca + Modelo + Frase central da função/descrição do produto.
    const leanSignature = buildLeanProductSignature({
      brand,
      model,
      description: productDescription,
    })

    // 5. Gerar embedding vetorial da consulta a partir da ASSINATURA ENXUTA
    let queryEmbedding: number[] | null = null
    const openAiKey = Deno.env.get('OPENAI_API_KEY') || ''
    if (openAiKey) {
      try {
        queryEmbedding = await generateEmbedding(leanSignature, openAiKey)
      } catch (embErr) {
        console.warn(
          'Falha ao gerar embedding para assinatura enxuta NCM (continuando com busca textual):',
          embErr,
        )
      }
    }

    // 6. Recuperar candidatos via RPC search_ncm_candidates usando a assinatura enxuta
    const rpcParams: {
      query: string
      query_embedding?: string | null
      top_n: number
      match_threshold: number
    } = {
      query: leanSignature,
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

    let candidates = Array.isArray(rawCandidates) ? [...rawCandidates] : []

    // 6.B. Detecção de assinatura de controlador/periférico/console remoto
    // Avaliar assinatura do produto para evitar confusão entre aparelho de controle e máquina controlada
    const lowerSig = (
      leanSignature +
      ' ' +
      productDescription +
      ' ' +
      additionalSpecs
    ).toLowerCase()
    const isControllerSignature = isProductControllerOrPeripheral(lowerSig)

    // Se a assinatura indica controlador/joystick/console/periférico remoto:
    // 1) Garantir e priorizar 85437099 e 85299090 no TOPO dos candidatos com score alto
    // 2) Penalizar severamente candidatos de máquinas mecânicas de elevação/guindastes/gruas (8426/8428)
    if (isControllerSignature) {
      // Buscar no banco as posições canônicas 85437099 e 85299090 (sem Ex-Tarifário)
      const targetNcms = ['85437099', '85299090']
      const { data: canonicalRates } = await supabaseAdmin
        .from('imp_sim_tax_rates_effective')
        .select('*')
        .in('ncm', targetNcms)
        .or('ex.is.null,ex.eq.')

      const canonicalCandidates: any[] = []
      if (canonicalRates && canonicalRates.length > 0) {
        for (const fb of canonicalRates) {
          canonicalCandidates.push({
            tax_rate_id: fb.id,
            ncm: fb.ncm,
            ex: fb.ex || '',
            ncm_descricao:
              fb.ncm_descricao ||
              (fb.ncm === '85437099'
                ? 'Outras máquinas e aparelhos elétricos com função própria não especificados nem compreendidos em outras posições do Capítulo 85'
                : 'Partes reconhecíveis como destinada única ou principalmente às câmeras de televisão da posição 85.25'),
            ex_descricao: fb.ex_descricao || null,
            source_text: `NCM ${fb.ncm} | ${fb.ex_descricao || fb.ncm_descricao || (fb.ncm === '85437099' ? 'Aparelhos elétricos com função própria' : 'Partes para câmeras de televisão')}`,
            ii_rate: Number(fb.ii_efetivo ?? fb.ii_rate ?? 0),
            ipi_rate: Number(fb.ipi_rate ?? 0),
            pis_rate: Number(fb.pis_rate ?? 2.1),
            cofins_rate: Number(fb.cofins_rate ?? 9.65),
            has_ex_tarifario: Boolean(fb.has_ex_tarifario),
            vector_score: 0.95,
            text_score: 0.95,
            combined_score: 0.95,
            is_priority_boosted: true,
          })
        }
      }

      // Remover duplicatas de 85437099 e 85299090 da lista original e penalizar 8426 / 8428
      const filteredExisting = candidates
        .filter(
          (c: any) =>
            !(c.ncm === '85437099' && (!c.ex || c.ex === '')) &&
            !(c.ncm === '85299090' && (!c.ex || c.ex === '')),
        )
        .map((c: any) => {
          const ncmDigits = normalizeNcm(c.ncm)
          const isLiftingMachine = isLiftingOrCraneNcm(
            ncmDigits,
            c.ncm_descricao,
            c.ex_descricao,
            c.source_text,
          )
          if (isLiftingMachine) {
            // Penalização condicional severa: reduz score para o final da fila
            return {
              ...c,
              combined_score: Math.min(Number(c.combined_score || 0.01) * 0.05, 0.01),
              vector_score: Math.min(Number(c.vector_score || 0.01) * 0.05, 0.01),
              text_score: Math.min(Number(c.text_score || 0.01) * 0.05, 0.01),
              penalized_crane: true,
            }
          }
          return c
        })

      // Ordenar: canônicos prioritários no topo, seguidos dos demais ordenados por combined_score decrescente
      candidates = [
        ...canonicalCandidates,
        ...filteredExisting.sort(
          (a: any, b: any) => Number(b.combined_score || 0) - Number(a.combined_score || 0),
        ),
      ]
    }

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
Analisar as especificações técnicas de um equipamento (audiovisual, broadcast, TI, ótica ou industrial) e determinar com rigor a classificação NCM e Ex-Tarifário mais adequada e juridicamente defensável.

METODOLOGIA OBRIGATÓRIA FUNÇÃO-PRIMEIRO (FUNCTION-FIRST):
1. ENUNCIAÇÃO PRÉVIA DA FUNÇÃO ESSENCIAL:
   Antes de qualquer seleção de NCM, você DEVE enunciar em 1 (uma) frase clara e inequívoca qual é a FUNÇÃO ESSENCIAL DO PRODUTO (o que o produto É, e não a máquina externa que ele opera).
   Se o produto é um console/controlador remoto/joystick com saídas IP, serial ou VISCA para comandar câmeras PTZ, a função essencial é de COMANDO E CONTROLE ELETRÔNICO REMOTO DE CÂMERAS, e o produto É um periférico/aparelho eletrônico de controle.
2. PROIBIÇÃO ABSOLUTA DE CASAMENTO POR VOCABULÁRIO (VOCABULARY-MATCHING BAN):
   É TERMINANTEMENTE PROIBIDO escolher um candidato NCM ou Ex-Tarifário apenas por termos, palavras-chave ou vozes verbais coincidentes (exemplo: "controle remoto", "joystick", "posicionamento", "acionamento", "câmeras") quando a FUNÇÃO ESSENCIAL do candidato divergir da função do produto.
   Exemplo crítico: se o produto é um "controlador remoto com joystick para câmeras PTZ", o produto É O CONTROLADOR ELETRÔNICO (recaia em 8543.70.99 ou 8529.90.90), e JAMAIS uma grua robótica, guindaste ou braço mecânico articulado de elevação (posições 8426/8428). É PROIBIDO classificar o controlador como a máquina mecânica externa!
3. REGRA DE PARTES E ACESSÓRIOS (RGI 3a, NOTAS DE SEÇÃO XVI E REGRAS GERAIS 3a/5):
   - Partes e acessórios destinados única ou principalmente a aparelhos de uma posição seguem a classificação do equipamento principal ou da sua subposição específica de partes (ex.: controles, joysticks e consoles de comando de câmeras seguem 8529.90.90 como partes/acessórios de câmeras da 8525, ou 8543.70.99 como aparelhos elétricos com função própria não especificada em outras posições do Capítulo 85).
   - Não confunda o dispositivo eletrônico de controle com máquinas mecânicas de elevação ou transporte de carga do Capítulo 84.
4. PROIBIÇÃO DE EX-TARIFÁRIO DE OUTRO EQUIPAMENTO:
   É PROIBIDO escolher um Ex-Tarifário cuja descrição descreva outro equipamento ou máquina mecânica completa (ex.: 8426.99.00 Ex 004 gruas robóticas telescópicas), mesmo que contenha termos em comum ("controle remoto", "joystick", "câmeras").
5. CANDIDATOS VÁLIDOS E ALTERNATIVAS FUNCIONALMENTE PLAUSÍVEIS:
   - UNIVERSO FECHADO: Você DEVE ESCOLHER O NCM E EX RECOMENDADO E AS ALTERNATIVAS ESTRITAMENTE DENTRE A LISTA DE CANDIDATOS FORNECIDA ABAIXO.
   - As alternativas secundárias devem ser FUNCIONALMENTE PLAUSÍVEIS (ex.: posições fiscais concorrentes para a mesma natureza do produto), e NÃO apenas parecidas no texto.
6. RESPOSTA EXCLUSIVAMENTE EM JSON:
   Responda com um único bloco JSON válido, sem texto introdutório, no formato exato:
{
  "essential_function": "Uma frase enunciando a função essencial do produto",
  "recommended_ncm": "string de 8 dígitos",
  "recommended_ex": "string com o número do Ex (ex: '001') ou '' se sem Ex",
  "justification": "Justificativa detalhada fundamentada nas RGI (RGI 1, RGI 3a/b, RGI 6) e características do produto",
  "legal_basis": {
    "regime": "BK ou BIT ou GERAL",
    "notes": "referência legal ou justificativa sumária"
  },
  "confidence": "alta" | "media" | "baixa",
  "alternatives": [
    {
      "ncm": "8 dígitos",
      "ex": "Ex ou ''",
      "reason": "Motivo funcionalmente plausível pelo qual esta alternativa pode ser considerada como plano de contingência fiscal"
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

    // 10.B. REQUISITO (2 & 3): SEGUNDA PASSADA DE AUDITORIA LLM QUE VETA OU CORRIGE A RECOMENDAÇÃO
    // O auditor revisor é obrigado a enunciar a função essencial do produto antes de qualquer veto.
    // Fica TERMINANTEMENTE PROIBIDO de corrigir para descrição de máquina mecânica quando a função é de controle.
    const initialRecommendation = {
      recommended_ncm: normalizeNcm(llmResponseJson.recommended_ncm),
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

    try {
      const auditorSystemPrompt = `Você é o Auditor Revisor Sênior da Receita Federal e Aduana, atuando como segunda instância independente para homologar ou vetar a recomendação de classificação NCM.

PROTOCOLO OBRIGATÓRIO DE AUDITORIA (EM DUAS ETAPAS):
ETAPA 1 - ENUNCIAÇÃO OBRIGATÓRIA DA FUNÇÃO ESSENCIAL:
Você DEVE obrigatoriamente iniciar enunciando a função essencial do produto ("essential_function"): declare com precisão o que o produto É em sua essência (ex: "Console/controlador remoto eletrônico com joystick para comando e movimentação de câmeras PTZ").

ETAPA 2 - REGRAS DE JULGAMENTO (APROVA ou VETA):
1. PROIBIÇÃO DE MÁQUINA MECÂNICA PARA FUNÇÃO DE CONTROLE:
   Se a função do produto for de controle, console, joystick, comando remoto, interface ou periférico de sinal/vídeo, É TERMINANTEMENTE PROIBIDO sugerir ou corrigir para posições de máquinas mecânicas de elevação, gruas, guindastes, pontes rolantes ou braços telescópicos (especialmente posições 8426 ou 8428).
   O produto É o periférico/aparelho elétrico de controle (Capítulo 85: 8543.70.99, 8529.90.90 ou 8537.10.20), JAMAIS a máquina mecânica que ele opera.
2. VETO DE CASAMENTO POR VOCABULÁRIO:
   Se a 1ª passada cometeu o erro de classificar um controlador remoto como 8426 (gruas de câmeras) ou 8428 (máquinas de elevação) por atração das palavras "controle remoto", "joystick" ou "câmera" na descrição de um Ex-Tarifário, VETE IMEDIATAMENTE (action: "VETA") e CORRIJA para a posição correta do Capítulo 85 (8543.70.99 ou 8529.90.90).
3. HOMOLOGAÇÃO:
   Se a 1ª passada já recomendou uma posição válida e consistente com a função essencial (ex: 8543.70.99, 8529.90.90 ou 8537.10.20 para controles; 8525 para câmeras), APROVE (action: "APROVA"). NUNCA vete uma recomendação eletrônica correta para substituí-la por uma máquina mecânica do 8426/8428!
4. REQUISITO DE CORREÇÃO:
   Se você VETAR, a correção ("corrected_ncm") DEVE ser obrigatoriamente um NCM e Ex VÁLIDOS pertencentes à lista de candidatos fornecida.

RESPOSTA OBRIGATÓRIA EXCLUSIVAMENTE EM JSON:
{
  "essential_function": "Obrigatório: Enunciação clara da função essencial do produto ANTES de qualquer análise",
  "action": "APROVA" ou "VETA",
  "audit_critique": "Análise crítica do enquadramento e da direção da recomendação",
  "corrected_ncm": "8 dígitos do NCM corrigido (obrigatório se VETA, deve ser um da lista de candidatos)",
  "corrected_ex": "Ex do NCM corrigido ou ''",
  "correction_reason": "Justificativa legal e técnica fundamentada na NESH, RGI e TEC"
}`

      const auditorUserPrompt = `PRODUTO ANALISADO:
- Marca: ${brand || 'Não informada'}
- Modelo: ${model || 'Não informado'}
- Descrição: ${productDescription}
- Assinatura Enxuta: ${leanSignature}
- Especificações: ${additionalSpecs || 'N/A'}

RECOMENDAÇÃO DA 1ª PASSADA:
- Função Enunciada: ${initialRecommendation.essential_function}
- NCM Recomendado: ${initialRecommendation.recommended_ncm}
- Ex Recomendado: ${initialRecommendation.recommended_ex || 'Nenhum'}
- Justificativa da 1ª passada: ${initialRecommendation.justification}

LISTA DE CANDIDATOS VÁLIDOS NO BANCO OFICIAL:
${candidatesCatalogText}

Lembre-se: primeiro enuncie a função do produto no campo "essential_function". Se o produto for aparelho de controle/console/joystick, JAMAIS aprove ou sugira posições de máquinas mecânicas de elevação/gruas (8426/8428).`

      // Executar com o primeiro provedor com chave válida
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

      // 10.C. REQUISITO (1): GUARDA DETERMINÍSTICA EM CÓDIGO (VETO DO VETO)
      // Se a assinatura do produto indica controlador/joystick/console remoto e a correção do auditor
      // aponta para 8426 ou 8428 (máquinas de elevação/gruas), REJEITAR a correção do auditor,
      // manter ou restaurar a recomendação eletrônica (85437099 / 85299090 / 85371020)
      // e registrar o "veto-do-veto" explicitamente no log de auditoria.
      if (auditVerdict.action === 'VETA' && auditVerdict.corrected_ncm) {
        const correctedDigits = normalizeNcm(auditVerdict.corrected_ncm)
        const correctedIsLifting = isLiftingOrCraneNcm(correctedDigits)

        if (isControllerSignature && correctedIsLifting) {
          // Disparo da Guarda Determinística: Inversão indevida do auditor detectada
          console.warn(
            `[Guarda Determinística Ativada] VETO-DO-VETO: O auditor tentou inverter a classificação de um controlador/periférico para máquina de elevação/grua (${correctedDigits}). Correção rejeitada deterministicamente pelo sistema.`,
          )

          const originalDigits = normalizeNcm(initialRecommendation.recommended_ncm)
          const originalIsLifting = isLiftingOrCraneNcm(originalDigits)

          // Escolher a melhor recomendação eletrônica:
          // Se a 1ª passada foi eletrônica (85437099, 85299090 ou 85371020), manter;
          // Se a 1ª passada também foi indevidamente 8426/8428, forçar para o topo eletrônico (85437099 ou 85299090)
          let targetElectronicNcm = originalDigits
          let targetElectronicEx = initialRecommendation.recommended_ex

          if (originalIsLifting || !originalDigits.startsWith('85')) {
            // Priorizar 85437099 ou 85299090
            const bestElectronic = candidates.find((c: any) => {
              const n = normalizeNcm(c.ncm)
              return (
                n === '85437099' ||
                n === '85299090' ||
                (n.startsWith('85') && !isLiftingOrCraneNcm(n))
              )
            })
            targetElectronicNcm = bestElectronic ? normalizeNcm(bestElectronic.ncm) : '85437099'
            targetElectronicEx = bestElectronic?.ex || ''
          }

          const vetoDoVetoMsg = `[Guarda Determinística Aduaneira - Veto do Veto Ativado]: A tentativa do auditor de reenquadrar o controlador/joystick sob máquina mecânica de elevação/gruas (NCM ${correctedDigits}) foi rejeitada pelo sistema. O produto é um periférico/controlador eletrônico para câmeras PTZ, enquadrado legitimamente sob o Capítulo 85 (${targetElectronicNcm}), em conformidade com as Notas de Seção XVI e Regras Gerais de Interpretação (RGI 1 e RGI 3a).`

          auditVerdict.override_applied = true
          auditVerdict.override_reason = vetoDoVetoMsg
          auditVerdict.action = 'APROVA' // Reverte ação efetiva para aprovação da rota eletrônica segura

          llmResponseJson.recommended_ncm = targetElectronicNcm
          llmResponseJson.recommended_ex = targetElectronicEx
          llmResponseJson.justification = `${vetoDoVetoMsg}\n\nFundamentação Técnica Original: ${initialRecommendation.justification}`
        } else {
          // Correção legítima do auditor (não tenta transformar controlador em grua)
          const candidateMatch = candidates.find(
            (c: any) => normalizeNcm(c.ncm) === auditVerdict.corrected_ncm,
          )
          if (candidateMatch) {
            console.log(
              `[Auditoria NCM] VETO APLICADO: de ${llmResponseJson.recommended_ncm} para ${auditVerdict.corrected_ncm}. Motivo: ${auditVerdict.correction_reason}`,
            )
            llmResponseJson.recommended_ncm = auditVerdict.corrected_ncm
            llmResponseJson.recommended_ex = auditVerdict.corrected_ex || candidateMatch.ex || ''
            llmResponseJson.justification = `[Revisão de Auditoria Aduaneira: Veto e Correção Homologados]\n${auditVerdict.correction_reason || auditVerdict.audit_critique}\n\nFundamentação Complementar: ${llmResponseJson.justification}`
          } else {
            console.warn(
              `[Auditoria NCM] Auditor sugeriu NCM ${auditVerdict.corrected_ncm} fora da lista de candidatos. Mantendo recomendação validada.`,
            )
          }
        }
      } else if (isControllerSignature) {
        // Auditor aprovou, mas verificar se a recomendação da 1ª passada recaiu em 8426/8428
        const recDigits = normalizeNcm(llmResponseJson.recommended_ncm)
        if (isLiftingOrCraneNcm(recDigits)) {
          console.warn(
            `[Guarda Determinística Ativada] A recomendação aprovada apontava para grua/elevação (${recDigits}) em produto controlador. Substituindo deterministicamente por posição eletrônica do Capítulo 85.`,
          )
          const bestElectronic = candidates.find((c: any) => {
            const n = normalizeNcm(c.ncm)
            return n === '85437099' || n === '85299090'
          }) || { ncm: '85437099', ex: '' }

          const targetNcm = normalizeNcm(bestElectronic.ncm)
          const targetEx = bestElectronic.ex || ''
          const overrideMsg = `[Guarda Determinística Aduaneira]: Correção automática aplicada. Dispositivo de controle com joystick e interface PTZ não pode ser classificado como máquina de elevação/grua (${recDigits}). Enquadramento direcionado para o Capítulo 85 (NCM ${targetNcm}).`

          auditVerdict.override_applied = true
          auditVerdict.override_reason = overrideMsg
          llmResponseJson.recommended_ncm = targetNcm
          llmResponseJson.recommended_ex = targetEx
          llmResponseJson.justification = `${overrideMsg}\n\nFundamentação Complementar: ${llmResponseJson.justification}`
        }
      }
    } catch (auditErr) {
      console.warn(
        'Falha na segunda passada de auditoria (mantendo recomendação inicial):',
        auditErr,
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
      justification:
        llmResponseJson.justification ||
        'Classificação fundamentada na RGI 1 e notas explicativas da TEC.',
      legal_basis: llmResponseJson.legal_basis || primaryTaxRate.legal_basis || {},
      ex_details: exDetails,
    }

    // 13. Gravação no log de auditoria (imp_sim_ncm_classification_log)
    // REQUISITO (3): Guardar ambas as versões (recomendação inicial + veredito do auditor)
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
              lean_signature: leanSignature,
              initial_recommendation: initialRecommendation,
              audit_verdict: auditVerdict,
            },
            final_choice_ncm: recommendedNcmClean,
            final_choice_ex: primaryTaxRate.ex || recommendedExClean,
            confirmed_by: callerUserId,
            status: 'pendente',
            product_id: productId,
            imp_sim_product_id: impSimProductId,
            audit_links: webSources,
            knowledge_base_version: '2.6',
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

    // 14. Resposta JSON completa com dados da auditoria
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
      audit_verdict: auditVerdict,
      lean_signature: leanSignature,
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

/**
 * Identifica se o texto/assinatura do produto indica um dispositivo de controle remoto,
 * joystick, console de comando ou periférico de interface/sinal para câmeras ou broadcast.
 */
function isProductControllerOrPeripheral(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()

  // Sinais fortes de controle/joystick/console
  const hasControllerWord =
    lower.includes('controller') ||
    lower.includes('controlador') ||
    lower.includes('joystick') ||
    lower.includes('remote control') ||
    lower.includes('controle remoto') ||
    lower.includes('control panel') ||
    lower.includes('painel de controle') ||
    lower.includes('console de comando') ||
    lower.includes('console de oper') ||
    lower.includes('ptz control')

  // Contextos audiovisuais / periféricos
  const hasCameraOrAVContext =
    lower.includes('camera') ||
    lower.includes('câmera') ||
    lower.includes('ptz') ||
    lower.includes('video') ||
    lower.includes('vídeo') ||
    lower.includes('broadcast') ||
    lower.includes('visca') ||
    lower.includes('rs-422') ||
    lower.includes('ip remote')

  return (
    hasControllerWord &&
    (hasCameraOrAVContext || lower.includes('rm-ip') || lower.includes('joystick'))
  )
}

/**
 * Identifica se um NCM ou descrição de candidato refere-se a gruas, guindastes,
 * braços robóticos telescópicos ou máquinas mecânicas de elevação/movimentação (8426/8428).
 */
function isLiftingOrCraneNcm(
  ncmDigits: string,
  ncmDesc?: string | null,
  exDesc?: string | null,
  sourceText?: string | null,
): boolean {
  if (!ncmDigits) return false
  if (ncmDigits.startsWith('8426') || ncmDigits.startsWith('8428')) {
    return true
  }

  const combined = `${ncmDesc || ''} ${exDesc || ''} ${sourceText || ''}`.toLowerCase()
  if (
    combined.includes('grua') ||
    combined.includes('guindaste') ||
    combined.includes('braço automatizado') ||
    combined.includes('braço articulado') ||
    combined.includes('lança telescópica') ||
    combined.includes('máquina de elevação') ||
    combined.includes('máquinas de elevação') ||
    combined.includes('içamento')
  ) {
    return true
  }

  return false
}

/**
 * Constrói uma assinatura enxuta do produto: Marca + Modelo + Frase central da função.
 * Isola a identidade e função essencial sem ruído de portas, pinos, conectores e acessórios periféricos.
 */
function buildLeanProductSignature(params: {
  brand?: string
  model?: string
  description?: string
}): string {
  const brand = (params.brand || '').trim()
  const model = (params.model || '').trim()
  let desc = (params.description || '').trim()

  // Extrair a frase central da descrição (primeira frase ou até pontuação/quebra de linha)
  // Remover conectores ou blocos de especificações comuns se houver
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
