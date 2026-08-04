import { createClient } from 'npm:@supabase/supabase-js'

interface AgentConfig {
  id: string
  provider_name: string
  provider_type: string
  model_id: string
  api_key_secret_name: string
  custom_endpoint?: string | null
  priority?: number | null
}

let cachedAgents: AgentConfig[] | null = null
let cachedAgentsAt = 0
const AGENT_CACHE_TTL = 300_000

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

export async function getActiveAgents(supabase?: any): Promise<AgentConfig[]> {
  const now = Date.now()
  if (cachedAgents && now - cachedAgentsAt < AGENT_CACHE_TTL) return cachedAgents

  const client = supabase ?? getAdminClient()
  const { data, error } = await client
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (error || !data || data.length === 0) {
    cachedAgents = []
  } else {
    cachedAgents = data as AgentConfig[]
  }
  cachedAgentsAt = now
  return cachedAgents
}

interface GenerateContext {
  agentSettings?: any
  aiSettings?: any
  products?: any[]
  manufacturerList?: string
  history?: any[]
  currentProductId?: string | null
  currentProductName?: string | null
  currentProductImageUrl?: string | null
  currentProductDescription?: string | null
  currentProductTechnicalInfo?: string | null
  currentProductPriceUsd?: number | null
  contextualProductData?: any
  institutionalContext?: string
  productPagePrompt?: string
  currentProductContext?: any
}

function resolveApiKey(agent: AgentConfig): string {
  if (agent.api_key_secret_name) {
    const key = Deno.env.get(agent.api_key_secret_name)
    if (key) return key
  }
  const pt = (agent.provider_type || agent.provider_name || '').toLowerCase()
  if (pt.includes('openai') || pt.includes('gpt')) return Deno.env.get('OPENAI_API_KEY') ?? ''
  if (pt.includes('deepseek')) return Deno.env.get('DEEPSEEK_API_KEY') ?? ''
  if (pt.includes('anthropic') || pt.includes('claude'))
    return Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  return ''
}

function getProviderConfig(agent: AgentConfig) {
  const apiKey = resolveApiKey(agent)
  const model = agent.model_id || 'gpt-4o-mini'
  const pt = (agent.provider_type || agent.provider_name || '').toLowerCase()

  if (pt.includes('anthropic') || pt.includes('claude')) {
    return {
      endpoint: agent.custom_endpoint || 'https://api.anthropic.com/v1/messages',
      apiKey,
      model: model || 'claude-3-5-sonnet-20241022',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }
  }

  if (pt.includes('deepseek')) {
    return {
      endpoint: agent.custom_endpoint || 'https://api.deepseek.com/v1/chat/completions',
      apiKey,
      model: model || 'deepseek-chat',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    }
  }

  return {
    endpoint: agent.custom_endpoint || 'https://api.openai.com/v1/chat/completions',
    apiKey,
    model,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  }
}

function buildRequestBody(
  agent: AgentConfig,
  config: ReturnType<typeof getProviderConfig>,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
) {
  const pt = (agent.provider_type || agent.provider_name || '').toLowerCase()
  if (pt.includes('anthropic') || pt.includes('claude')) {
    const systemMsg = messages.find((m) => m.role === 'system')
    const userMsgs = messages.filter((m) => m.role !== 'system')
    return {
      model: config.model,
      max_tokens: 2000,
      temperature,
      system: systemMsg?.content ?? '',
      messages: userMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    }
  }
  return {
    model: config.model,
    messages,
    temperature,
    max_tokens: 2000,
  }
}

function extractContent(agent: AgentConfig, data: any): string {
  const pt = (agent.provider_type || agent.provider_name || '').toLowerCase()
  if (pt.includes('anthropic') || pt.includes('claude')) {
    return data?.content?.map((c: any) => c.text).join('') ?? ''
  }
  return data?.choices?.[0]?.message?.content ?? ''
}

function formatPrice(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || value === 0) return null
  const locale = currency === 'BRL' ? 'pt-BR' : 'en-US'
  const symbol = currency === 'BRL' ? 'R$' : 'US$'
  const formatted = Number(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${symbol} ${formatted}`
}

function buildSystemPrompt(context: GenerateContext): string {
  const parts: string[] = []

  if (context.agentSettings?.system_prompt) {
    parts.push(context.agentSettings.system_prompt)
  }

  if (context.productPagePrompt) {
    parts.push(context.productPagePrompt)
  }

  if (context.manufacturerList) {
    parts.push(`Fabricantes disponíveis: ${context.manufacturerList}`)
  }

  if (context.institutionalContext) {
    parts.push(`Informações institucionais:\n${context.institutionalContext}`)
  }

  if (context.currentProductId && context.currentProductName) {
    const ctxParts: string[] = [
      `CONTEXTO: O usuário está visualizando o produto ${context.currentProductName} (ID: ${context.currentProductId}).`,
      'Qualquer pergunta que não mencione explicitamente outro produto refere-se a este produto de origem.',
    ]
    if (context.currentProductImageUrl) {
      ctxParts.push(`Imagem do produto: ${context.currentProductImageUrl}`)
    }
    if (context.currentProductDescription) {
      ctxParts.push(`Descrição: ${context.currentProductDescription.slice(0, 800)}`)
    }
    if (context.currentProductTechnicalInfo) {
      ctxParts.push(
        `Especificações técnicas: ${context.currentProductTechnicalInfo.slice(0, 1500)}`,
      )
    }
    if (context.currentProductPriceUsd) {
      ctxParts.push(`Preço USD (FOB Miami): $${context.currentProductPriceUsd}`)
    }
    parts.push(ctxParts.join('\n'))
  }

  parts.push(
    `INSTRUÇÃO ESTRUTURAL FIXA (NÃO REMOVER): Na seção "Análise por Produto", insira imediatamente após cada título de produto o marcador <!-- PRODUCT_IMAGE:UUID --> usando o UUID exato do token [PRODUCT:UUID] fornecido no contexto. Na seção "Comparativo Técnico", insira o mesmo marcador <!-- PRODUCT_IMAGE:UUID --> dentro da célula correspondente a cada produto na tabela. O UUID deve ser o identificador exato fornecido nos tokens [PRODUCT:UUID].`,
  )

  parts.push(
    `REGRA DE PREÇO (OBRIGATÓRIO): O preço padrão a ser exibido é sempre o preço USA (retirada em Miami), em dólares (US$). O preço entregue no Brasil / preço nacionalizado (valores em reais — R$) NÃO deve ser informado ao usuário a menos que ele solicite explicitamente o preço no Brasil, o preço com entrega, o preço nacionalizado ou o preço em reais. Nunca exiba valores em BRL por iniciativa própria.`,
  )

  parts.push(
    `REGRA DE IDENTIFICADORES (OBRIGATÓRIO): IDs de produtos, UUIDs e tokens internos como [PRODUCT:UUID] NUNCA devem aparecer na resposta visível ao usuário — nem em texto, títulos, listas, tabelas ou qualquer outra seção. Apenas o nome limpo do produto deve ser exibido. Remova completamente qualquer UUID ou token interno do texto final apresentado ao usuário.`,
  )

  return parts.filter(Boolean).join('\n\n')
}

function buildMessages(
  query: string,
  context: GenerateContext,
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  if (context.history && context.history.length > 0) {
    for (const h of context.history.slice(-6)) {
      messages.push({ role: h.role, content: h.content || h.message || '' })
    }
  }

  let userContent = query

  if (context.products && context.products.length > 0) {
    userContent += '\n\nProdutos relevantes do catálogo:\n'
    for (const p of context.products) {
      const usdPrice = formatPrice(p.price_usd, 'USD')
      const natPrice = formatPrice(
        p.price_nationalized_sales,
        p.price_nationalized_currency || 'BRL',
      )
      const brlRefPrice = !natPrice ? formatPrice(p.price_brl, 'USD') : null

      userContent += `- [PRODUCT:${p.id}] ${p.name}`
      if (usdPrice) userContent += ` | Preço USA (retirada Miami): ${usdPrice}`
      if (natPrice) userContent += ` | Preço Brasil (entrega SP): ${natPrice}`
      if (brlRefPrice) userContent += ` | Preço Brasil (referência USD): ${brlRefPrice}`
    }
  }

  if (context.contextualProductData) {
    userContent += '\n\nProduto atual da página:\n'
    userContent += JSON.stringify(
      {
        id: context.contextualProductData.id,
        name: context.contextualProductData.name,
        price_usd: context.contextualProductData.price_usd,
        manufacturer: context.contextualProductData.manufacturer,
        image_url: context.contextualProductData.image_url || null,
        technical_info: context.contextualProductData.technical_info || null,
        description: context.contextualProductData.description || null,
        category: context.contextualProductData.category || null,
      },
      null,
      2,
    )
    userContent +=
      '\n(Produto atual da página - NÃO incluir nos produtos referenciados, a menos que o usuário pergunte especificamente sobre ele)'
  }

  messages.push({ role: 'user', content: userContent })
  return messages
}

function parseAIResponse(content: string, context: GenerateContext): any {
  const productIds: string[] = []
  const idRegex = /\[PRODUCT:([0-9a-fA-F-]{36})\]/g
  let match: RegExpExecArray | null
  while ((match = idRegex.exec(content)) !== null) {
    if (match[1] !== context.currentProductId) {
      productIds.push(match[1])
    }
  }
  const cleanedContent = content.replace(idRegex, '').trim()

  const hasProductMatch = productIds.length > 0
  const confidenceLevel = hasProductMatch ? 'high' : 'medium'

  const shouldShowWhatsApp =
    confidenceLevel === 'low' || (!hasProductMatch && !context.institutionalContext)

  const filteredProductIds = productIds.filter((id) => id !== context.currentProductId)

  return {
    content: cleanedContent,
    confidence_level: confidenceLevel,
    referenced_internal_products: filteredProductIds,
    ai_referenced_products: filteredProductIds,
    should_show_whatsapp_button: shouldShowWhatsApp,
  }
}

export async function generateResponse(
  queryOrMessages: string | Array<{ role: string; content: string }>,
  contextOrOptions?: any,
  _unused?: any,
  supabase?: any,
): Promise<any> {
  if (Array.isArray(queryOrMessages)) {
    const content = await _callAIProvider(queryOrMessages, contextOrOptions || {}, supabase)
    return { content }
  }

  const context: GenerateContext = contextOrOptions || {}
  const systemPrompt = buildSystemPrompt(context)
  const messages = buildMessages(queryOrMessages, context, systemPrompt)
  const content = await _callAIProvider(messages, { temperature: 0.3 }, supabase)

  return parseAIResponse(content, context)
}

async function _callAIProvider(
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number } = {},
  supabase?: any,
): Promise<string> {
  const temperature = options.temperature ?? 0.3
  const providers = await getActiveAgents(supabase)

  if (providers.length === 0) {
    return 'Desculpe, não foi possível processar sua solicitação no momento.'
  }

  for (const agent of providers) {
    const config = getProviderConfig(agent)
    if (!config.apiKey) continue

    try {
      const body = buildRequestBody(agent, config, messages, temperature)
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        continue
      }

      const data = await response.json()
      const content = extractContent(agent, data)
      if (content) return content
    } catch {
      continue
    }
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature,
          max_tokens: 2000,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        return data.choices?.[0]?.message?.content || ''
      }
    } catch {}
  }

  return 'Desculpe, não foi possível obter uma resposta dos provedores de IA no momento.'
}
