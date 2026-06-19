import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
}

// NORMALIZAR AI RESPONSE
function normalizeAIResponse(rawResponse: any, providerType: string) {
  const type = (providerType || '').toLowerCase()

  if (type === 'anthropic' || type.includes('anthropic')) {
    const contentBlocks = rawResponse.content || []
    const textContent = contentBlocks
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')

    const toolCalls = contentBlocks
      .filter((c: any) => c.type === 'tool_use')
      .map((c: any) => ({
        id: c.id,
        type: 'function',
        function: {
          name: c.name,
          arguments: JSON.stringify(c.input || {}),
        },
      }))

    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : null,
          },
        },
      ],
    }
  }

  // OpenAI e compatíveis já estão no formato correto
  return rawResponse
}

// Função de fallback
async function callAIWithFallback(
  providers: any[],
  messages: any[],
  tools?: any[],
  tool_choice?: string,
  responseFormat?: any,
  signal?: AbortSignal,
) {
  let lastError: any = null
  let usedProviderType = 'openai'

  for (const provider of providers) {
    try {
      console.log(
        `[AI_PROVIDER] Tentando ${provider.provider_name} (priority ${provider.priority})`,
      )
      const data = await callAIProvider(
        provider,
        messages,
        tools,
        tool_choice,
        responseFormat,
        signal,
      )
      usedProviderType = provider.provider_type || 'openai'
      console.log(`[AI_PROVIDER] Sucesso com ${provider.provider_name}`)
      return { data, providerType: usedProviderType }
    } catch (err: any) {
      console.log(`[AI_PROVIDER] Falha com ${provider.provider_name}: ${err.message}`)
      lastError = err
      continue
    }
  }

  throw new Error(`Todos os provedores de IA falharam. Último erro: ${lastError?.message}`)
}

// =========================
// CACHE GLOBAL (7. Redução de latência via cache em memória)
// =========================
let cachedManufacturers = ''
let cachedManufacturersAt = 0
const MANUFACTURER_CACHE_TTL = 10 * 60 * 1000 // 10 minutos

async function getManufacturersContext(supabase: any): Promise<string> {
  const now = Date.now()

  // Se cache ainda é válido, retorna
  if (cachedManufacturers && now - cachedManufacturersAt < MANUFACTURER_CACHE_TTL) {
    console.log('[LOG] Usando cache de fabricantes')
    return cachedManufacturers
  }

  // Caso contrário, busca do banco
  console.log('[LOG] Atualizando cache de fabricantes')
  const { data: manufacturers } = await supabase
    .from('products')
    .select('manufacturer')
    .not('manufacturer', 'is', null)
    .order('manufacturer')

  // 1. Usar Set para remover duplicatas (sem .distinct())
  const uniqueManufacturers = [
    ...new Set((manufacturers || []).map((m: any) => m.manufacturer?.trim()).filter(Boolean)),
  ]

  // 4. Limitar tamanho do prompt (máx 80 fabricantes ou 1200 chars)
  const limitedManufacturers = uniqueManufacturers.slice(0, 80)

  // 6. Sanitizar cada fabricante contra prompt injection
  const sanitizedManufacturers = limitedManufacturers.map((m) => sanitizeInput(m))

  cachedManufacturers = sanitizedManufacturers.join(', ')
  cachedManufacturersAt = now

  return cachedManufacturers
}

// =========================
// HELPERS DE ALTA CONFIABILIDADE
// =========================

async function loadCacheSettings(supabase: any) {
  const { data, error } = await supabase.from('cache_settings').select('*').limit(1).maybeSingle()

  if (error) {
    console.log('[LOG] Aviso ao carregar cache_settings (tabela vazia ou erro):', error.message)
  }

  return {
    miExpirationDays: data?.mi_expiration_days ?? 365,
    productSearchCacheExpirationDays: data?.product_search_cache_expiration_days ?? 30,
    productCacheExpirationDays: data?.product_cache_expiration_days ?? 90,
  }
}

async function getActiveAIProviders(supabase: any) {
  const { data: providers, error } = await supabase
    .from('ai_providers')
    .select(
      'provider_name, api_key_secret_name, model_id, provider_type, custom_endpoint, priority',
    )
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (error || !providers || providers.length === 0) {
    throw new Error('Nenhum provedor de IA ativo encontrado')
  }
  return providers
}

async function callAIProvider(
  provider: any,
  messages: any[],
  tools?: any[],
  tool_choice?: string,
  responseFormat?: any,
  signal?: AbortSignal,
) {
  const apiKey = Deno.env.get(provider.api_key_secret_name)
  if (!apiKey) throw new Error(`API key não encontrada: ${provider.api_key_secret_name}`)

  let endpoint: string
  let headers: Record<string, string>
  let body: any

  if (
    provider.provider_type === 'openai' ||
    provider.provider_name.toLowerCase().includes('openai')
  ) {
    endpoint = provider.custom_endpoint || 'https://api.openai.com/v1/chat/completions'
    headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
    body = {
      model: provider.model_id,
      messages,
      ...(tools && { tools }),
      ...(tool_choice && { tool_choice }),
      ...(responseFormat && { response_format: responseFormat }),
    }
  } else if (
    provider.provider_type === 'anthropic' ||
    provider.provider_name.toLowerCase().includes('anthropic')
  ) {
    endpoint = provider.custom_endpoint || 'https://api.anthropic.com/v1/messages'
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }
    body = {
      model: provider.model_id,
      max_tokens: 4096,
      messages: messages.filter((m: any) => m.role !== 'system'),
      system: messages.find((m: any) => m.role === 'system')?.content || '',
    }
  } else {
    endpoint = provider.custom_endpoint || 'https://api.openai.com/v1/chat/completions'
    headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
    body = {
      model: provider.model_id,
      messages,
      ...(tools && { tools }),
      ...(tool_choice && { tool_choice }),
      ...(responseFormat && { response_format: responseFormat }),
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(`${provider.provider_name} error: ${response.status} ${await response.text()}`)
  }

  return await response.json()
}

// =========================
// PRODUCT SEARCH CACHE (PSC)
// =========================

/**
 * Verifica se existe cache válido para a query hash informada.
 * Retorna os dados enriquecidos se encontrado e não expirado.
 */
// =========================
// PRODUCT SEARCH CACHE (PSC)
// =========================

async function checkProductSearchCache(supabase: any, searchQuery: string) {
  try {
    const { data, error } = await supabase
      .from('product_search_cache')
      .select('product_specs, expires_at')
      .eq('search_query', searchQuery)
      .single()

    if (error || !data) {
      console.log(`[CACHE_MISS][PSC] ${searchQuery}`)
      return null
    }

    if (new Date() > new Date(data.expires_at)) {
      console.log(`[CACHE_MISS][PSC] Expirado: ${searchQuery}`)
      return null
    }

    const specs = data.product_specs || {}
    return {
      productIds: specs.productIds || [],
      enrichedSpecs: specs.enriched || {},
      semanticFilters: specs.semanticFilters || [],
      marketKeywords: specs.marketKeywords || [],
      // ❌ REMOVIDO: finalResponse nunca mais existe aqui
    }
  } catch (err) {
    console.log(`[CACHE_MISS][PSC] Exceção: ${err}`)
    return null
  }
}

/**
 * Salva contexto enriquecido no PSC para futuras buscas.
 * TTL lido dinamicamente de cache_settings ou fallback de 30 dias.
 */

async function saveProductSearchCache(
  supabase: any,
  queryHash: string,
  productIds: string[],
  enrichedSpecs: any,
  semanticFilters: any,
  marketKeywords: string[],
) {
  try {
    let ttlDays = 30
    try {
      const { data: cfg } = await supabase
        .from('cache_settings')
        .select('product_search_cache_expiration_days')
        .single()
      if (cfg?.product_search_cache_expiration_days)
        ttlDays = cfg.product_search_cache_expiration_days
    } catch {}

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + ttlDays)

    const { error } = await supabase.from('product_search_cache').upsert(
      {
        search_query: queryHash,
        product_name: 'cached_search',
        product_specs: {
          productIds,
          enriched: enrichedSpecs,
          semanticFilters,
          marketKeywords,
        },
        source: 'ai_generated',
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'search_query' },
    )

    if (!error) console.log(`[CACHE_SAVE][PSC] Query salva: ${queryHash}`)
  } catch (err) {
    console.log(`[CACHE_SAVE][PSC] Exceção: ${err}`)
  }
}

// =========================
// PRODUCT CACHE (PC)
// =========================

/**
 * Busca specs técnicas válidas no product_cache para os produtos informados.
 * Retorna objeto agrupado por product_id.
 */
async function enrichProductsWithCache(supabase: any, productIds: string[]) {
  if (!productIds || productIds.length === 0) return {}

  try {
    const { data, error } = await supabase
      .from('product_cache')
      .select('product_id, spec_key, spec_value, source, confidence')
      .in('product_id', productIds)
      .gt('expires_at', new Date().toISOString())

    if (error) {
      console.log(`[PC_ERROR] ${error.message}`)
      return {}
    }

    const enriched: Record<string, Record<string, any>> = {}
    for (const row of data || []) {
      if (!enriched[row.product_id]) enriched[row.product_id] = {}
      enriched[row.product_id][row.spec_key] = {
        value: row.spec_value,
        source: row.source,
        confidence: row.confidence,
      }
    }

    for (const id of productIds) {
      console.log(enriched[id] ? `[PC_HIT] ${id}` : `[PC_MISS] ${id}`)
    }

    return enriched
  } catch (err) {
    console.log(`[PC_ERROR] ${err}`)
    return {}
  }
}

async function hashQuery(query: string, context: string = ''): Promise<string> {
  const text = `${query.toLowerCase().trim()}|${context}`
  const msgUint8 = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeJSONParse(str: string, fallback: any = null): any {
  if (!str || typeof str !== 'string') return fallback
  try {
    return JSON.parse(str)
  } catch {
    try {
      const cleaned = str
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim()
      return JSON.parse(cleaned)
    } catch {
      return fallback
    }
  }
}

function sanitizeInput(text: any): string {
  if (text === null || text === undefined) return ''
  return String(text)
    .replace(/[^a-zA-Z0-9\sÀ-ÿ\-_\\.\,\?\!\(\)\"\'\:\/\+\%\@\#\&\|]/g, '')
    .slice(0, 3000)
}

const isUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

function getHeuristicIntent(query: string, currentProductId: string | null): string {
  const q = query.toLowerCase()
  if (
    ['horário', 'quem somos', 'localização', 'garantia', 'logística', 'endereço', 'contato'].some(
      (t) => q.includes(t),
    )
  )
    return 'INSTITUTIONAL'
  if (currentProductId || /\b(sony|canon|blackmagic|atem|fx3|fx6|r5|r6|pocket|6k|4k)\b/i.test(q))
    return 'PRODUCT_SPECIFIC'
  return 'GENERIC'
}

async function checkRateLimit(supabase: any, identifier: string, limit: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_ai_rate_limit', {
    user_identifier: identifier,
    max_requests: limit,
  })
  if (error) {
    console.error('[RATE LIMIT ERROR]', error)
    return true
  }
  return data as boolean
}

function buildDynamicSystemPrompt(
  agentSettings: any,
  aiSettings: any,
  companyInfo: any,
  manufacturerList: string,
  userName: string | null,
  productContext: { id: string; name: string; technicalInfo?: string } | null,
  isFirstInteraction: boolean,
): string {
  const parts: string[] = []

  // 1. SEMPRE: Identidade do Agente (com substituição de {userName})
  let identity = agentSettings?.system_prompt ?? ''
  if (userName && identity.includes('{userName}')) {
    identity = identity.replace(/{userName}/g, userName)
  }
  if (identity.trim()) parts.push(identity)

  // 2. SEMPRE: Regras Estritas (template operacional)
  const strictRules = aiSettings?.system_prompt_template ?? ''
  if (strictRules.trim()) parts.push(strictRules)

  // 3. SÓ SE estiver na Página de Produto: product_page_prompt
  if (productContext) {
    let productPrompt = aiSettings?.product_page_prompt ?? ''
    if (productPrompt.includes('{{productName}}')) {
      productPrompt = productPrompt.replace(/{{productName}}/g, productContext.name)
    }
    if (productPrompt.trim()) parts.push(productPrompt)

    // ✅ INSTRUÇÃO HARDOCODED DE SEGURANÇA — não depende do banco
    parts.push(
      [
        'CONTEXTO OBRIGATORIO DE PAGINA DE PRODUTO:',
        `Voce esta na pagina do produto "${productContext.name}".`,
        productContext.technicalInfo
          ? `Especificacoes tecnicas: ${productContext.technicalInfo.slice(0, 1500)}`
          : '',
        '',
        'REGRAS ABSOLUTAS:',
        '1. Sua funcao e sugerir APENAS produtos COMPLEMENTARES (acessorios, lentes, baterias, grips, tripes, monitores, cabos, adaptadores, cases, etc.) que sejam compativeis com o produto atual.',
        '2. PROIBIDO sugerir produtos substitutos da mesma categoria principal. Se o produto atual e uma camera, NUNCA sugira outras cameras.',
        '3. PROIBIDO confundir cameras com lentes ou acessorios. Um produto com "Camera" ou "Camera" no nome e uma camera, nao uma lente.',
        '4. Se nao encontrar acessorios compativeis, seja honesto: "Nao localizei acessorios compativeis especificos para este produto em nosso catalogo."',
        '5. Sempre que mencionar precos, use a moeda correta: precos Miami sao em USD (US$), precos Brasil podem ser em BRL (R$) ou em USD (US$), dependendo de price_nationalized_currency.',
      ].join('\n'),
    )
  }

  // 4. SÓ NA SEGUNDA INTERAÇÃO: Logística + Contexto da Empresa
  if (!isFirstInteraction) {
    const logistics = aiSettings?.logistics_rules_prompt ?? ''
    if (logistics.trim()) parts.push(logistics)

    const companyContext = companyInfo?.content || companyInfo?.transparency_note || ''
    if (companyContext.trim()) parts.push(companyContext)
  }

  // 5. SEMPRE: Lista de fabricantes disponíveis
  parts.push(`### FABRICANTES DISPONÍVEIS\n${manufacturerList}`)

  // 6. SEMPRE: Regras de formato JSON (apenas estrutura, NÃO proíbe markdown)
  parts.push(
    [
      'FORMATO DE RESPOSTA OBRIGATORIO:',
      'Responda EXCLUSIVAMENTE em JSON valido, sem blocos markdown no JSON, sem texto antes ou depois.',
      'Estrutura: { "message": "...", "referenced_internal_products": ["uuid"], "confidence_level": "high", "should_show_whatsapp_button": false }',
      '',
      'ATENCAO: O campo "message" ACEITA markdown completo (negrito, italico, titulos, tabelas, listas).',
      'Use markdown profissional para tornar a resposta rica e legivel.',
    ].join('\n'),
  )

  // 7. INSTRUÇÃO DE USO DA FERRAMENTA DE BUSCA (sempre presente)
  parts.push(
    [
      '### USO DA FERRAMENTA search_products',
      'Quando precisar buscar produtos no catálogo, chame a ferramenta search_products com UM ÚNICO parâmetro:',
      '- term: nome curto e específico do produto (máximo 3-4 palavras)',
      '',
      'REGRA CRITICA DE PRESERVACAO DE MARCA:',
      'Se o usuario mencionar uma MARCA ou MODELO ESPECIFICO (ex: Dulens, Sigma, Canon, Sony FX6, Blackmagic URSA),',
      'O TERM DEVE INCLUIR essa marca/modelo. NUNCA substitua por um termo generico.',
      '',
      'EXEMPLOS CORRETOS:',
      '- Usuário pergunta: "Quantos stops a Sony FX6 tem?" → term: "Sony FX6"',
      '- Usuário pergunta: "Tripé para Blackmagic Pyxis" → term: "tripé Pyxis"',
      '- Usuário pergunta: "Lente 50mm para Canon R5" → term: "lente 50mm Canon"',
      '- Usuário pergunta: "Lentes Dulens para URSA" → term: "Dulens URSA"',
      '- Usuário pergunta: "Lentes dulens compativels com essa camera" → term: "Dulens"',
      '',
      'ERRADO:',
      '- NUNCA passe a pergunta completa do usuário como termo de busca.',
      '- NUNCA use termos genéricos como "câmera", "acessório" ou "equipamento" sozinhos.',
      '- NUNCA ignore uma marca específica mencionada pelo usuário (ex: nunca busque apenas "PL mount lens" se o usuário pediu "Dulens").',
    ].join('\n'),
  )
  return parts.join('\n\n')
}

serve(async (req: Request) => {
  console.log('[LOG] Request iniciada')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime = performance.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

  try {
    // 1. Parse do body
    const body = await req.json()
    const query = sanitizeInput(body?.query)

    // 1.1 IP do cliente (para rate limit)
    const forwarded = req.headers.get('x-forwarded-for')
    const clientIP = forwarded
      ? forwarded.split(',')[0].trim()
      : req.headers.get('x-real-ip') || 'unknown'

    // ============================================
    // PASSO 2: CAPTURA DE VARIÁVEIS DE CONTEXTO
    // ============================================
    const userName = body?.userName || null
    const lastReferencedProductId = body?.currentProductId || null

    // Detecta se é primeira interação (nenhuma mensagem anterior do assistente)
    const requestMessages = body?.messages || []
    const isFirstInteraction = !requestMessages.some((m: any) => m.role === 'assistant')

    // 2. Criação do cliente Supabase (ANTES de qualquer uso)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 3. Geração do hash (ANTES do lookup)
    const queryHash = await hashQuery(query, `${body?.currentProductId || 'global'}`)

    const allowedIds = new Set<string>()
    let allFoundProducts: any[] = []

    let keywordScore = 0,
      productsFound = 0,
      searchPerformed = false

    // 4. Lookup do PSC
    const cachedSearch = await checkProductSearchCache(supabase, queryHash)

    // ✅ Só usa o cache se a resposta final estiver salva lá dentro
    // ✅ CACHE HIT INTELIGENTE: monta contexto do PSC, mas deixa a IA gerar resposta
    let pscProducts: any[] = []
    if (cachedSearch && cachedSearch.productIds.length > 0) {
      console.log(`[CACHE_HIT][PSC] Contexto recuperado para: ${queryHash}`)

      // Busca os produtos do banco pelos IDs salvos no PSC
      const { data: cachedProducts } = await supabase
        .from('products')
        .select('*')
        .in('id', cachedSearch.productIds)
        .abortSignal(controller.signal)

      if (cachedProducts && cachedProducts.length > 0) {
        pscProducts = cachedProducts.map((p: any) => ({
          ...p,
          cached_specs: cachedSearch.enrichedSpecs[p.id] || {},
        }))
        console.log(`[CACHE_HIT][PSC] ${pscProducts.length} produtos carregados do contexto`)
        productsFound = pscProducts.length
        pscProducts.forEach((p: any) => allowedIds.add(p.id))
      }
    }

    if (!query.trim())
      return new Response(
        JSON.stringify({
          message: 'Como posso ajudar?',
          referenced_internal_products: [],
          should_show_whatsapp_button: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )

    const session_id = typeof body?.session_id === 'string' ? body.session_id : null
    const currentProductId =
      typeof body?.currentProductId === 'string' && isUUID(body.currentProductId)
        ? body.currentProductId
        : null

    const [ipAllowed, sessionAllowed] = await Promise.all([
      checkRateLimit(supabase, `ip:${clientIP}`, 20),
      session_id ? checkRateLimit(supabase, `session:${session_id}`, 50) : Promise.resolve(true),
    ])

    if (!ipAllowed || !sessionAllowed) {
      console.log('[LOG] Rate limit atingido')
      return new Response(
        JSON.stringify({ error: 'Muitas requisições. Tente novamente em 1 minuto.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 },
      )
    }

    let productCacheExpirationDays = 7
    try {
      const cacheConfig = await loadCacheSettings(supabase)
      if (cacheConfig && typeof cacheConfig.productCacheExpirationDays === 'number') {
        productCacheExpirationDays = cacheConfig.productCacheExpirationDays
      }
    } catch (err) {
      console.log('[LOG] Aviso: loadCacheSettings falhou, usando fallback de 7 dias.')
    }

    const intent = getHeuristicIntent(query, currentProductId)

    const tDbMeta = performance.now()
    const [
      { data: agentSettings },
      { data: aiSettings },
      { data: companyInfo },
      { data: globalSettings },
    ] = await Promise.all([
      supabase.from('ai_agent_settings').select('*').maybeSingle(),
      supabase.from('ai_settings').select('*').maybeSingle(),
      supabase.from('company_info').select('*').maybeSingle(),
      supabase.from('settings').select('key, value'),
    ])
    console.log(`[PERF][DB_META] ${Math.round(performance.now() - tDbMeta)}ms`)

    const globalSettingsMap: Record<string, string | number | boolean | null> = {}
    if (Array.isArray(globalSettings))
      globalSettings.forEach((s) => {
        if (s.key) globalSettingsMap[s.key] = s.value
      })

    if (intent === 'INSTITUTIONAL') {
      const response = {
        message: companyInfo?.content || 'Somos a My Way Video.',
        confidence_level: 'high',
        referenced_internal_products: [],
        should_show_whatsapp_button: false,
      }
      if (session_id)
        await supabase
          .from('chat_messages')
          .insert({ session_id, role: 'assistant', content: response.message })
      console.log(`[PERF][TOTAL] ${Math.round(performance.now() - startTime)}ms`)
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const pcQuery = supabase
      .from('product_cache')
      .select('response_text')
      .eq('query_hash', queryHash)

    if (productCacheExpirationDays > 0)
      pcQuery.gte(
        'created_at',
        new Date(Date.now() - productCacheExpirationDays * 86400000).toISOString(),
      )
    const { data: cached } = await pcQuery.maybeSingle()
    if (cached) {
      console.log('[LOG] Cache hit')
      const result = safeJSONParse(cached.response_text)
      if (result) {
        console.log(`[PERF][TOTAL_CACHE] ${Math.round(performance.now() - startTime)}ms`)
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    let history: any[] = []
    if (session_id) {
      const { data: histRows } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', session_id)
        .order('created_at', { ascending: false })
        .limit(6)
      if (histRows)
        history = histRows
          .reverse()
          .map((r) => ({ role: r.role, content: sanitizeInput(r.content).slice(0, 1000) }))
    }

    let validCurrentProductId: string | null = null
    if (currentProductId) {
      const tCheck = performance.now()
      const { data: prodCheck } = await supabase
        .from('products')
        .select('id')
        .eq('id', currentProductId)
        .maybeSingle()
      if (prodCheck) {
        validCurrentProductId = prodCheck.id
        allowedIds.add(validCurrentProductId)
      }
      console.log(`[PERF][DB_CHECK_PRODUCT] ${Math.round(performance.now() - tCheck)}ms`)
    }

    // 2. Carregar fabricantes com cache (não em toda requisição)
    const tManufacturers = performance.now()
    const manufacturerList = await getManufacturersContext(supabase)
    console.log(`[PERF][MANUFACTURERS] ${Math.round(performance.now() - tManufacturers)}ms`)

    // 3. systemPrompt com regras determinísticas contra hallucination
    // ============================================
    // PASSO 4: MONTAGEM DINÂMICA DO SYSTEM PROMPT
    // ============================================

    // Busca contexto do produto SE houver currentProductId
    let productContext: { id: string; name: string; technicalInfo?: string } | null = null
    if (lastReferencedProductId) {
      const { data: prodData } = await supabase
        .from('products')
        .select('id, name, technical_info, description')
        .eq('id', lastReferencedProductId)
        .single()

      if (prodData) {
        const rawSpecs = prodData.technical_info || prodData.description || ''
        productContext = {
          id: prodData.id,
          name: prodData.name,
          technicalInfo: typeof rawSpecs === 'string' ? rawSpecs : JSON.stringify(rawSpecs),
        }
      }
    }

    // Chama a função que criamos no Passo 1
    const systemPrompt = buildDynamicSystemPrompt(
      agentSettings,
      aiSettings,
      companyInfo,
      manufacturerList,
      userName,
      productContext, // ← 1 parâmetro só, em vez de 2
      isFirstInteraction,
    )

    console.log(`[DEBUG] Prompt montado. Tamanho: ${systemPrompt.length} caracteres`)
    console.log(`[DEBUG] Primeira interação: ${isFirstInteraction}`)
    console.log(`[DEBUG] Página de produto: ${productContext ? 'SIM' : 'NÃO'}`)

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: query },
    ]

    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_products',
          description: 'Busca produtos reais no catálogo My Way.',
          parameters: {
            type: 'object',
            properties: { term: { type: 'string' } },
            required: ['term'],
          },
        },
      },
    ]

    // Na página de produto, deixa a IA decidir se precisa buscar algo.
    // Perguntas técnicas puras (frame rate, resolução) não precisam de tool call.
    const toolChoice = intent === 'PRODUCT_SPECIFIC' && !currentProductId ? 'required' : 'auto'

    // Carrega provedores ativos uma única vez por requisição
    const aiProviders = await getActiveAIProviders(supabase)

    const tOpenAI1 = performance.now()
    const { data: aiData, providerType } = await callAIWithFallback(
      aiProviders,
      messages,
      tools,
      toolChoice,
      undefined,
      controller.signal,
    )
    const normalizedData = normalizeAIResponse(aiData, providerType)
    console.log(`[PERF][OPENAI_1] ${Math.round(performance.now() - tOpenAI1)}ms`)

    const aiMessage = normalizedData?.choices?.[0]?.message
    if (!aiMessage) throw new Error('Invalid AI Response')

    console.log(
      `[DEBUG_T1] tool_calls presentes: ${!!aiMessage.tool_calls} | quantidade: ${aiMessage.tool_calls?.length || 0} | nomes: ${aiMessage.tool_calls?.map((tc: any) => tc.function?.name).join(',') || 'nenhum'}`,
    )

    console.log(
      '[DEBUG_PP] AI RESPONSE:',
      JSON.stringify(
        {
          hasToolCalls: !!aiMessage?.tool_calls?.length,
          toolNames: aiMessage?.tool_calls?.map((tc: any) => tc.function.name) || [],
          searchTerm: aiMessage?.tool_calls?.find(
            (tc: any) => tc.function.name === 'search_products',
          )?.function?.arguments as string,
          currentProductId: body.currentProductId, // PP vs HP
        },
        null,
        2,
      ),
    )

    if (aiMessage.tool_calls) {
      searchPerformed = true
      messages.push({
        role: 'assistant',
        content: aiMessage.content ?? '',
        tool_calls: aiMessage.tool_calls,
      })

      for (const toolCall of aiMessage.tool_calls.slice(0, 3)) {
        if (toolCall.function.name !== 'search_products') continue
        const args = safeJSONParse(toolCall.function.arguments, {})
        const searchTerm =
          typeof args.term === 'string' ? sanitizeInput(args.term).slice(0, 300) : query
        // ✅ LOG CRÍTICO PARA DEBUG
        console.log(
          `[SEARCH_TERM] Termo extraído pela IA: "${searchTerm}" (original: "${args.term || '[fallback para query]'}")`,
        )
        const tokens = searchTerm
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 1)
        const { data: keywords } = await supabase
          .from('avpro_keywords')
          .select('keyword, weight, is_blocking')
          .in('keyword', tokens)
        if (keywords?.some((k) => k.is_blocking)) {
          console.log(`[PERF][TOTAL_BLOCKED] ${Math.round(performance.now() - startTime)}ms`)
          return new Response(
            JSON.stringify({
              message: 'Termo fora de escopo.',
              confidence_level: 'low',
              referenced_internal_products: [],
              should_show_whatsapp_button: false,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }

        keywordScore += keywords?.reduce((acc, k) => acc + Number(k.weight || 0), 0) || 0
        const queryBoost = Math.min(
          3.0,
          1.0 + (keywords?.reduce((acc, k) => acc + Number(k.weight), 0) || 0),
        )

        const tRPC = performance.now()
        const { data: products, error: rpcError } = await supabase
          .rpc('search_products_v2', { search_term: searchTerm, boost_multiplier: queryBoost })
          .abortSignal(controller.signal)
        console.log(`[PERF][RPC_SEARCH] ${Math.round(performance.now() - tRPC)}ms`)

        // ✅ ETAPA 2 — LOG DEBUG PARA PP (RPC raw products) — INSIRA AQUI
        if (body.currentProductId) {
          // Só PP
          console.log(
            '[DEBUG_PP] RPC RAW PRODUCTS:',
            JSON.stringify(
              {
                count: products?.length || 0,
                firstProduct: products?.[0]
                  ? {
                      id: products[0].id,
                      name: products[0].name,
                      image_url: products[0].image_url,
                    }
                  : null,
                rpcError: rpcError?.message || null,
                currentProductId: body.currentProductId,
              },
              null,
              2,
            ),
          )
        }
        if (rpcError) throw new Error('Search engine failure')

        productsFound += products?.length || 0
        products?.forEach((p: any) => allowedIds.add(p.id))

        if (products) allFoundProducts.push(...products)

        // ✅ LOG DE DEPURAÇÃO: amostra dos dados crus da RPC (PROTEGIDO)
        if (products && products.length > 0) {
          try {
            console.log(`[DEBUG_RPC] Total produtos retornados: ${products.length}`)
            const firstProd = products[0]
            console.log(`[DEBUG_RPC] Primeiro produto ID: ${firstProd?.id || 'N/A'}`)
            console.log(`[DEBUG_RPC] Primeiro produto nome: ${firstProd?.name || 'N/A'}`)
            console.log(`[DEBUG_RPC] price_usd: ${firstProd?.price_usd || 'null'}`)
            console.log(`[DEBUG_RPC] price_brl: ${firstProd?.price_brl || 'null'}`)
            console.log(
              `[DEBUG_RPC] Nomes (primeiros 5): ${products
                .slice(0, 5)
                .map((p: any) => p.name)
                .join(' | ')}`,
            )
          } catch (debugErr) {
            console.log(`[DEBUG_RPC] Erro ao logar: ${debugErr}`)
          }
        } else {
          console.log(`[DEBUG_RPC] NENHUM produto retornado pela RPC`)
        }

        const compactProducts = (products || []).slice(0, 26).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          manufacturer: p.manufacturer,
          category: p.category,
          price_miami_usd: p.price_usd,
          price_nationalized: p.price_nationalized_sales,
          price_nationalized_currency: p.price_nationalized_currency,
        }))

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(compactProducts),
        })
      } // ← Fechamento do for

      // ✅ LOG DIAGNÓSTICO PP/HP #2 — Estado após RPC
      console.log(
        `[DEBUG_T2] productsFound: ${productsFound} | allowedIds size: ${allowedIds.size} | allowedIds: ${Array.from(allowedIds).join(',') || 'vazio'}`,
      )

      // ✅ FALLBACK: se a RPC não encontrou nada, instrui a IA a responder com conhecimento geral
      if (productsFound === 0) {
        if (!lastReferencedProductId) {
          // Home page: produto não está no catálogo
          console.log(`[SEARCH_FALLBACK] Nenhum produto encontrado na home page para: "${query}"`)
          messages.push({
            role: 'system',
            content:
              'Nenhum produto foi encontrado no catálogo para este termo. Responda com base no seu conhecimento técnico geral. Se não souber, diga honestamente. NUNCA invente especificações técnicas. Não sugira encaminhamento ao WhatsApp apenas por não encontrar o produto.',
          })
        } else {
          // Página de produto: acessório não encontrado no catálogo
          console.log(`[SEARCH_FALLBACK] Nenhum acessório compatível encontrado para: "${query}"`)
          messages.push({
            role: 'system',
            content:
              'Nenhum acessório compatível foi encontrado em nosso catálogo para este produto. No entanto, responda à pergunta do usuário com base no seu conhecimento técnico geral sobre compatibilidade, especificações e o que funciona com este equipamento. NUNCA invente especificações. Não sugira encaminhamento ao WhatsApp apenas por não encontrar o acessório.',
          })
        }
      }

      if (keywordScore < 1.0 && productsFound === 0 && intent !== 'PRODUCT_SPECIFIC') {
        console.log(`[PERF][TOTAL_NO_PRODUCTS] ${Math.round(performance.now() - startTime)}ms`)
        return new Response(
          JSON.stringify({
            message:
              'Posso ajudar apenas com audiovisual profissional e produtos do catálogo My Way.',
            confidence_level: 'low',
            referenced_internal_products: [],
            should_show_whatsapp_button: false,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const productIds = Array.from(allowedIds)

      // ETAPA 2 — ENRIQUECIMENTO VIA PRODUCT CACHE
      const enrichedSpecs = await enrichProductsWithCache(supabase, productIds)
      let specsContext = ''
      if (Object.keys(enrichedSpecs).length > 0) {
        specsContext = Object.entries(enrichedSpecs)
          .map(([pid, specs]) => {
            const specLines = Object.entries(specs as Record<string, any>)
              .map(([key, val]) => ` - ${key}: ${val.value} (fonte: ${val.source})`)
              .join('\n')
            return ` Produto ${pid}:\n${specLines}`
          })
          .join('\n\n')
        console.log(`[PC_CONTEXT] Specs injetados no prompt`)
      }

      // ETAPA 3 — LOG DEBUG PARA PP (corrigido: trata objeto como array de entries)
      if (body.currentProductId && Object.keys(enrichedSpecs).length > 0) {
        // Usa Object.keys().length
        const enrichedArray = Object.entries(enrichedSpecs).slice(0, 3) // Converte para array
        console.log(
          '[DEBUG_PP] ENRICHED PRODUCTS:',
          JSON.stringify(
            {
              count: Object.keys(enrichedSpecs).length,
              samplePids: enrichedArray.map(([pid]) => pid), // PIDs como amostra
              sampleSpecsCount: enrichedArray.map(([, specs]) => Object.keys(specs).length), // Contagem specs por PID
              totalSpecs: Object.values(enrichedSpecs).reduce(
                (acc: number, specs: any) => acc + Object.keys(specs).length,
                0,
              ),
            },
            null,
            2,
          ),
        )
      }

      // Cria cópia mutável do array de mensagens
      const finalMessages = [...messages]

      // 1. Se há specs enriquecidos, injeta como mensagem de contexto
      if (specsContext && specsContext.trim().length > 0) {
        finalMessages.push({
          role: 'system',
          content: [
            'DADOS TECNICOS COMPLEMENTARES (Product Cache):',
            '',
            specsContext,
            '',
            'Use estes dados para enriquecer sua resposta.',
            'NUNCA busque ou infira preco e peso na web ou em conhecimento previo.',
            'Se nao estiver na tabela de produtos, informe SOB CONSULTA.',
          ].join('\n'),
        })
      }

      // 2. INJEÇÃO DE FORMATO JSON PARA PÁGINA DE PRODUTO
      if (lastReferencedProductId) {
        finalMessages.push({
          role: 'system',
          content: [
            'FORMATO DE RESPOSTA OBRIGATORIO (JSON):',
            'Sua resposta DEVE ser um objeto JSON valido.',
            'Sem markdown.',
            'Sem explicacoes fora do JSON.',
            'Sem texto livre antes ou depois.',
            '',
            'Estrutura exata:',
            '{',
            ' "message": "texto da resposta em markdown",',
            ' "referenced_internal_products": ["uuid1", "uuid2"],',
            ' "confidence_level": "high",',
            ' "should_show_whatsapp_button": false',
            '}',
          ].join('\n'),
        })
      }

      // 3. INJEÇÃO DOS PRODUTOS ENCONTRADOS PELA RPC
      if (allFoundProducts && allFoundProducts.length > 0) {
        const topProducts = allFoundProducts.slice(0, 26)
        const productsContext = topProducts
          .map((p: any, index: number) => {
            const priceLines: string[] = []
            const precoFOB = p.price_usd || p.price_usa || null
            if (precoFOB) {
              priceLines.push(` • Preço FOB (USD): $${precoFOB}`)
            }
            if (p.price_nationalized_sales) {
              const currency = p.price_nationalized_currency || 'BRL'
              const symbol = currency === 'BRL' ? 'R$' : '$'
              priceLines.push(
                ` • Preço Nacionalizado (${currency}): ${symbol} ${p.price_nationalized_sales}`,
              )
            }
            const desc = p.description ? String(p.description).slice(0, 300) : 'Não disponível'
            let techInfoStr = 'Não disponível'
            if (p.technical_info) {
              const raw =
                typeof p.technical_info === 'object'
                  ? JSON.stringify(p.technical_info)
                  : String(p.technical_info)
              techInfoStr = raw.slice(0, 500)
            }
            return [
              `PRODUTO ${index + 1}:`,
              `- ID: ${p.id}`,
              `- Nome: ${p.name}`,
              `- Descrição: ${desc}`,
              `- Ficha Técnica: ${techInfoStr}`,
              priceLines.join('\n'),
            ].join('\n')
          })
          .join('\n\n')
        finalMessages.push({
          role: 'user',
          content: [
            'Abaixo estão os produtos reais encontrados em nosso catálogo.',
            '',
            'REGRAS OBRIGATÓRIAS PARA ESTA RESPOSTA:',
            '1. REFERÊNCIA DE IDs: Para cada produto mencionado, coloque o ID exato no array referenced_internal_products.',
            '2. NUNCA coloque nomes no array referenced_internal_products.',
            '3. NUNCA exiba UUIDs para o usuário.',
            '4. Para cada produto listado, informe preço FOB (USD) quando existir.',
            '5. Se o preço estiver ausente, escreva: "Consulte-nos para preço e condições especiais".',
            '6. Recomende TODOS os produtos relevantes.',
            '7. O campo message deve ter no máximo 2500 caracteres.',
            '',
            'DADOS DOS PRODUTOS:',
            productsContext,
          ].join('\n'),
        })
      }

      // SEGUNDA CHAMADA OPENAI (COM FALLBACK)
      // ✅ USA O CONTROLLER GLOBAL (40s) — não cria timeout próprio que mata o fallback
      const tOpenAI2 = performance.now()
      const { data: finalData, providerType: finalProviderType } = await callAIWithFallback(
        aiProviders,
        finalMessages,
        undefined,
        undefined,
        { type: 'json_object' },
        controller.signal, // ← signal global, não secondCallController
      )
      const normalizedFinal = normalizeAIResponse(finalData, finalProviderType)
      console.log(`[AI_PROVIDER_FINAL] ${finalProviderType}`)
      console.log(`[PERF][OPENAI_2] ${Math.round(performance.now() - tOpenAI2)}ms`)

      if (normalizedFinal?.choices?.[0]?.message) {
        aiMessage.content = normalizedFinal.choices[0].message.content
      }
    } // ← fecha: if (aiMessage.tool_calls)

    // Se não houve tool calls (pergunta técnica pura), a resposta já está em aiMessage.content
    // Mas pode não estar em JSON. Forçamos se necessário.
    let rawContent = aiMessage?.content || '{}'

    // Se não parece JSON e estamos na página de produto, empacotamos
    if (lastReferencedProductId && !rawContent.trim().startsWith('{')) {
      rawContent = JSON.stringify({
        message: rawContent,
        referenced_internal_products: [],
        confidence_level: 'high',
        should_show_whatsapp_button: false,
      })
    }

    // 5. PROCESSAMENTO FINAL (fora do if tool_calls)
    const rawResult = safeJSONParse(rawContent, {}) // ← rawContent, não aiMessage?.content

    // Remove UUIDs expostos na mensagem (garantia técnica, independe do comportamento da IA)
    if (typeof rawResult?.message === 'string') {
      rawResult.message = rawResult.message
        .replace(/[•-]?\s*ID:\s*[0-9a-f-]{36}/gi, '') // remove "• ID: uuid" ou "- ID: uuid"
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    const result = {
      message: typeof rawResult?.message === 'string' ? rawResult.message : 'Erro ao processar.',
      referenced_internal_products: Array.isArray(rawResult?.referenced_internal_products)
        ? rawResult.referenced_internal_products
        : [],
      confidence_level: rawResult?.confidence_level === 'high' ? 'high' : 'low',
      should_show_whatsapp_button:
        typeof rawResult?.should_show_whatsapp_button === 'boolean'
          ? rawResult.should_show_whatsapp_button
          : false,
    }

    console.log(`[LOG] IDs sugeridos pela IA: ${result.referenced_internal_products.join(',')}`)
    // ✅ LOG DIAGNÓSTICO PP/HP #3 — Antes do filtro allowedIds
    console.log(
      `[DEBUG_T3] IDs sugeridos count: ${result.referenced_internal_products?.length || 0} | allowedIds size: ${allowedIds.size} | interceptação esperada: ${result.referenced_internal_products?.filter((id: string) => allowedIds.has(id)).length || 0} de ${result.referenced_internal_products?.length || 0}`,
    )

    result.referenced_internal_products = result.referenced_internal_products.filter((id: string) =>
      allowedIds.has(id),
    )
    console.log(`[LOG] IDs validados: ${result.referenced_internal_products.join(',')}`)

    // LOG ANTES do strip (para validar se IA gera markdown)
    console.log('[DEBUG_MSG_RAW_BEFORE] message field:', (result.message || '').substring(0, 300))

    result.message = String(result.message || '')

    console.log('[DEBUG_MSG_RAW_AFTER] message field:', result.message.substring(0, 300))

    if (lastReferencedProductId) {
      result.message += '\n\n' + String(globalSettingsMap['transparency_note'] || '')
    }

    // PASSO 1.3 — SAVE NO PRODUCT SEARCH CACHE
    if (
      searchPerformed &&
      result.confidence_level === 'high' &&
      result.referenced_internal_products.length > 0
    ) {
      try {
        await saveProductSearchCache(
          supabase,
          queryHash,
          result.referenced_internal_products,
          {},
          [],
          [],
        )
        console.log(`[CACHE_SAVE][PSC] Contexto salvo para: ${queryHash}`)
      } catch (cacheSaveErr: any) {
        console.log(`[CACHE_SAVE][ERROR] Falha ao salvar PSC: ${cacheSaveErr.message}`)
      }
    }

    // Persistência de chat
    if (session_id) {
      await supabase.from('chat_messages').insert([
        { session_id, role: 'user', content: query },
        { session_id, role: 'assistant', content: result.message },
      ])
    }

    console.log(`[PERF][TOTAL_SUCCESS] ${Math.round(performance.now() - startTime)}ms`)

    // Busca dados completos dos produtos para renderizar cards no frontend
    let enrichedProducts: any[] = []
    if (result.referenced_internal_products.length > 0) {
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select(
          'id, name, sku, description, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category',
        )
        .in('id', result.referenced_internal_products)

      if (prodErr) {
        console.log(`[DEBUG_ENRICH] Erro na busca de produtos: ${prodErr.message}`)
      } else {
        console.log(`[DEBUG_ENRICH] Produtos encontrados: ${prodData?.length || 0}`)
        console.log(`[DEBUG_ENRICH] IDs buscados: ${result.referenced_internal_products.join(',')}`)
      }

      if (!prodErr && prodData) {
        enrichedProducts = prodData.filter((p: any) => {
          const pid = String(p?.id || '')
            .toLowerCase()
            .trim()
          const currentId = String(currentProductId || '')
            .toLowerCase()
            .trim()
          return pid !== currentId
        })
        console.log(`[DEBUG_ENRICH] Após filtro: ${enrichedProducts.length}`)
      }

      // ETAPA 4 — LOG DEBUG PARA PP (final injection)
      if (body.currentProductId && enrichedProducts?.length) {
        console.log(
          '[DEBUG_PP] FINAL INJECTION:',
          JSON.stringify(
            {
              productsCount: enrichedProducts.length,
              filteredCount: enrichedProducts.filter((p: any) => p.id !== body.currentProductId)
                .length,
              sampleUrls: enrichedProducts.slice(0, 2).map((p: any) => ({
                id: p.id,
                image_url: p.image_url || 'NULL/EMPTY',
              })),
              currentProductId: body.currentProductId,
            },
            null,
            2,
          ),
        )
      }

      // ✅ ASSIGNMENT NO FINAL: Agora enrichedProducts está populado
      if (enrichedProducts.length > 0) {
        console.log(`[DEBUG_RESPONSE] Injetando ${enrichedProducts.length} produtos no response`)
        Object.assign(result, { products: enrichedProducts })
      } else {
        console.log('[DEBUG_RESPONSE] Sem produtos para injetar')
      }
    }

    return new Response(
      JSON.stringify({
        ...result,
        products: enrichedProducts,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    const errorMsg =
      error?.name === 'AbortError' ? 'Request timeout' : error?.message || 'Unknown error'
    console.error('[ERRO CRÍTICO]', errorMsg)
    console.log(`[PERF][TOTAL_ERROR] ${Math.round(performance.now() - startTime)}ms`)

    return new Response(JSON.stringify({ error: errorMsg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  } finally {
    clearTimeout(timeoutId)
  }
})
