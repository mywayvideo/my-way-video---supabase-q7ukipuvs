import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

export interface AIProvider {
  id: string
  provider_name: string
  provider_type: string
  model_id: string
  api_key_secret_name: string
  custom_endpoint: string | null
  is_active: boolean
  priority: integer
}

export async function getActiveAgents(): Promise<AIProvider[]> {
  const client = getAdminClient()
  const { data, error } = await client
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (error) {
    console.error('[intelligence] Error fetching active agents:', error)
    return []
  }

  return (data ?? []) as AIProvider[]
}

function resolveApiKey(secretName: string): string {
  const key = Deno.env.get(secretName)
  if (!key) {
    console.warn(`[intelligence] API key not found for secret: ${secretName}`)
    return ''
  }
  return key
}

function getProviderConfig(provider: AIProvider) {
  const apiKey = resolveApiKey(provider.api_key_secret_name)
  const model = provider.model_id || 'gpt-4o-mini'

  switch (provider.provider_type?.toLowerCase()) {
    case 'openai':
      return {
        endpoint: provider.custom_endpoint || 'https://api.openai.com/v1/chat/completions',
        apiKey,
        model,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    case 'deepseek':
      return {
        endpoint: provider.custom_endpoint || 'https://api.deepseek.com/v1/chat/completions',
        apiKey,
        model: model || 'deepseek-chat',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    case 'anthropic':
      return {
        endpoint: provider.custom_endpoint || 'https://api.anthropic.com/v1/messages',
        apiKey,
        model: model || 'claude-3-5-sonnet-20241022',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      }
    default:
      return {
        endpoint: provider.custom_endpoint || 'https://api.openai.com/v1/chat/completions',
        apiKey,
        model,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
  }
}

function buildRequestBody(
  provider: AIProvider,
  config: ReturnType<typeof getProviderConfig>,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
) {
  if (provider.provider_type?.toLowerCase() === 'anthropic') {
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

function extractContent(provider: AIProvider, data: any): string {
  if (provider.provider_type?.toLowerCase() === 'anthropic') {
    return data?.content?.map((c: any) => c.text).join('') ?? ''
  }
  return data?.choices?.[0]?.message?.content ?? ''
}

function buildSystemPrompt(context: any): string {
  const parts: string[] = []

  if (context.agentSettings?.system_prompt) {
    parts.push(context.agentSettings.system_prompt)
  }

  if (context.productPagePrompt) {
    parts.push(context.productPagePrompt)
  }

  const rules = [
    'REGRAS DE FORMATAÇÃO DE PREÇOS:',
    '- Priorize sempre o preço USA (US$) como referência principal.',
    '- NUNCA troque o símbolo da moeda (US$ ou R$).',
    '- Se o produto tem preço USA em dólar, use US$.',
    '- Se o produto tem preço Brasil em real, use R$.',
    '- Preços em reais (R$) usam formato brasileiro: R$ 1.234,56',
    '- Preços em dólar (US$) usam formato americano: US$ 1,234.56',
    '',
    'REGRAS DE COMPORTAMENTO:',
    '- NÃO inclua produtos que não foram mencionados na sua resposta.',
    '- Se não tiver produtos relevantes, informe o usuário educadamente.',
    '- Se for uma comparação, destaque as diferenças técnicas.',
    '- Responda sempre em português brasileiro.',
    '- Seja técnico e objetivo.',
    '',
  ]

  parts.push(rules.join('\n'))
  return parts.filter(Boolean).join('\n\n')
}

function buildMessages(
  query: string,
  context: any,
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  if (context.history && context.history.length > 0) {
    for (const h of context.history.slice(-2)) {
      if (h.role === 'user') {
        messages.push({
          role: h.role,
          content: h.content || h.message || '',
        })
      }
    }
  }

  let userContent = query

  if (context.products && context.products.length > 0) {
    userContent += '\n\nProdutos relevantes do catálogo:\n'
    for (const p of context.products) {
      const usdPrice =
        p.price_usd && p.price_usd > 0
          ? Number(p.price_usd).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : null
      const natPrice =
        p.price_nationalized_sales && p.price_nationalized_sales > 0
          ? Number(p.price_nationalized_sales).toLocaleString(
              p.price_nationalized_currency === 'BRL' ? 'pt-BR' : 'en-US',
              { minimumFractionDigits: 2, maximumFractionDigits: 2 },
            )
          : null
      const brlRefPrice =
        !natPrice && p.price_brl && p.price_brl > 0
          ? Number(p.price_brl).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : null

      userContent += `- ${p.name}`
      if (usdPrice) userContent += ` | Preço USA (retirada Miami): US$${usdPrice}`
      if (natPrice)
        userContent += ` | Preço Brasil (entrega SP): ${
          p.price_nationalized_currency === 'BRL' ? 'R$' : 'US$'
        }${natPrice}`
      if (brlRefPrice) userContent += ` | Preço Brasil (referência): US$${brlRefPrice}`
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
      },
      null,
      2,
    )
    userContent +=
      '\n(Produto atual da página - NÃO incluir nos produtos referenciados, a menos que o usuário pergunte especificamente sobre ele)'
  }

  // LOG 2: Conteúdo formatado que a IA vai receber
  console.log('[price-check] userContent final (last 800 chars):', userContent.slice(-800))
  console.log('[price-check] context.products present:', context?.products?.length || 0)
  if (context?.products?.length > 0) {
    console.log(
      '[price-check] sample product prices:',
      JSON.stringify(
        context.products.slice(0, 2).map((p: any) => ({
          name: p.name?.substring(0, 50),
          price_usd: p.price_usd,
          price_brl: p.price_brl,
        })),
      ),
    )
  }
  messages.push({ role: 'user', content: userContent })
  return messages
}

function parseAIResponse(response: any, products: any[]): any {
  const content = typeof response === 'string' ? response : response?.content || ''

  return {
    content: content.trim(),
    confidence_level: response?.confidence_level || 'medium',
    should_show_whatsapp_button: response?.should_show_whatsapp_button ?? true,
    referenced_internal_products: Array.isArray(response?.referenced_internal_products)
      ? response.referenced_internal_products
      : (products || []).map((p: any) => p.id),
    ai_referenced_products: Array.isArray(response?.ai_referenced_products)
      ? response.ai_referenced_products
      : [],
  }
}

// GenerateResponse pública — aceita AMBOS os formatos:
//   Formato novo: generateResponse(messages[], options?)
//   Formato antigo: generateResponse(query, context, undefined, supabase)
export async function generateResponse(
  queryOrMessages: string | Array<{ role: string; content: string }>,
  contextOrOptions?: any,
  _unused?: any,
  supabase?: any,
): Promise<any> {
  // Se for array, é o formato novo (mensagens já montadas)
  if (Array.isArray(queryOrMessages)) {
    const content = await _callAIProvider(queryOrMessages, contextOrOptions || {})
    return { content }
  }
  // LOG 3: Formato da chamada
  console.log('[price-check] generateResponse query type:', typeof queryOrMessages)
  console.log('[price-check] generateResponse is array:', Array.isArray(queryOrMessages))
  console.log('[price-check] generateResponse context keys:', Object.keys(contextOrOptions || {}))

  // Se for string, é o formato antigo (query + contexto)
  const context = contextOrOptions || {}
  const systemPrompt = buildSystemPrompt(context)
  const messages = buildMessages(queryOrMessages, context, systemPrompt)
  const content = await _callAIProvider(messages, { temperature: 0.3 })

  // LOG 3b: messages prontas para o provider
  if (Array.isArray(messages)) {
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop()
    console.log(
      '[price-check] last user message (first 600 chars):',
      (lastUserMsg?.content || '').substring(0, 600),
    )
  }

  return parseAIResponse({ content }, context.products || [])
}

async function _callAIProvider(
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; provider?: AIProvider } = {},
): Promise<string> {
  const temperature = options.temperature ?? 0.3

  let providers: AIProvider[] = []
  if (options.provider) {
    providers = [options.provider]
  } else {
    providers = await getActiveAgents()
  }

  if (providers.length === 0) {
    console.warn('[intelligence] No active AI providers available')
    return 'Desculpe, não foi possível processar sua solicitação no momento.'
  }

  for (const provider of providers) {
    const config = getProviderConfig(provider)
    if (!config.apiKey) continue

    try {
      const body = buildRequestBody(provider, config, messages, temperature)
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(
          `[intelligence] Provider ${provider.provider_name} returned ${response.status}: ${errText}`,
        )
        continue
      }

      const data = await response.json()
      const content = extractContent(provider, data)
      if (content) return content
    } catch (err) {
      console.error(`[intelligence] Error with provider ${provider.provider_name}:`, err)
      continue
    }
  }

  return 'Desculpe, não foi possível obter uma resposta dos provedores de IA no momento.'
}
