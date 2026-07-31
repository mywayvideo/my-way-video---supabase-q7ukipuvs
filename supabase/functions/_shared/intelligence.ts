import { createClient } from 'npm:@supabase/supabase-js'

interface AgentConfig {
  id: string
  provider_name: string
  provider_type: string
  model_id: string
  api_key_secret_name: string
  custom_endpoint?: string
  priority?: number
}

let cachedAgents: AgentConfig[] | null = null
let cachedAgentsAt = 0
const AGENT_CACHE_TTL = 300_000

export async function getActiveAgents(supabase: any): Promise<AgentConfig[]> {
  const now = Date.now()
  if (cachedAgents && now - cachedAgentsAt < AGENT_CACHE_TTL) return cachedAgents

  const { data, error } = await supabase
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
  contextualProductData?: any
  institutionalContext?: string
}

export async function generateResponse(
  query: string,
  context: GenerateContext,
  _modelOverride: any,
  supabase: any,
): Promise<any> {
  if (!context.aiSettings?.product_page_prompt) {
    const { data: aiSettingsData } = await supabase
      .from('ai_settings')
      .select('product_page_prompt')
      .limit(1)
      .maybeSingle()
    if (aiSettingsData?.product_page_prompt) {
      context = {
        ...context,
        aiSettings: {
          ...context.aiSettings,
          product_page_prompt: aiSettingsData.product_page_prompt,
        },
      }
    }
  }

  if (!context.currentProductName && context.contextualProductData?.name) {
    context = { ...context, currentProductName: context.contextualProductData.name }
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

  const systemPrompt = buildSystemPrompt(context)
  const messages = buildMessages(query, context, systemPrompt)

  for (const agent of await getActiveAgents(supabase)) {
    try {
      let result: any = null
      const providerType = (agent.provider_type || agent.provider_name || '').toLowerCase()

      if (providerType.includes('openai') || providerType.includes('gpt')) {
        if (!openaiKey) continue
        result = await callOpenAI(openaiKey, agent.model_id || 'gpt-4o-mini', messages)
      } else if (providerType.includes('deepseek')) {
        if (!deepseekKey) continue
        result = await callDeepSeek(deepseekKey, agent.model_id || 'deepseek-chat', messages)
      } else if (providerType.includes('anthropic') || providerType.includes('claude')) {
        if (!anthropicKey) continue
        result = await callAnthropic(
          anthropicKey,
          agent.model_id || 'claude-3-5-sonnet-20241022',
          messages,
          systemPrompt,
        )
      } else if (openaiKey) {
        result = await callOpenAI(openaiKey, agent.model_id || 'gpt-4o-mini', messages)
      }

      if (result) {
        return parseAIResponse(result, context)
      }
    } catch (err) {
      console.error(`[intelligence] Agent ${agent.provider_name} failed:`, err)
    }
  }

  if (openaiKey) {
    try {
      const result = await callOpenAI(openaiKey, 'gpt-4o-mini', messages)
      return parseAIResponse(result, context)
    } catch (err) {
      console.error('[intelligence] OpenAI fallback failed:', err)
    }
  }

  return {
    content:
      'Desculpe, não foi possível processar sua solicitação no momento. Tente novamente em instantes.',
    confidence_level: 'low',
    referenced_internal_products: [],
    should_show_whatsapp_button: true,
  }
}

function buildSystemPrompt(context: GenerateContext): string {
  const agentSettings = context.agentSettings
  const aiSettings = context.aiSettings
  const parts: string[] = []

  const basePrompt = agentSettings?.system_prompt || aiSettings?.system_prompt_template || ''
  if (basePrompt) parts.push(basePrompt)

  if (context.manufacturerList) {
    parts.push(`Fabricantes disponíveis: ${context.manufacturerList}`)
  }

  if (context.institutionalContext) {
    parts.push(`Informações institucionais:\n${context.institutionalContext}`)
  }

  if (context.currentProductId && context.currentProductName) {
    parts.push(
      `CONTEXTO: O usuário está visualizando o produto ${context.currentProductName}. Qualquer pergunta que não mencione explicitamente outro produto refere-se a este produto de origem.`,
    )
  }

  if (context.aiSettings?.product_page_prompt) {
    parts.push(context.aiSettings.product_page_prompt)
  }

  return parts.filter(Boolean).join('\n\n')
}

function buildMessages(query: string, context: GenerateContext, systemPrompt: string): any[] {
  const messages: any[] = [{ role: 'system', content: systemPrompt }]

  if (context.history && context.history.length > 0) {
    for (const h of context.history.slice(-10)) {
      messages.push({ role: h.role, content: h.content || h.message || '' })
    }
  }

  let userContent = query
  if (context.products && context.products.length > 0) {
    userContent += '\n\nProdutos relevantes do catálogo:\n'
    const productsWithoutImages = context.products.map((p: any) => {
      const { image_url, ...rest } = p
      return rest
    })
    userContent += JSON.stringify(productsWithoutImages, null, 2)
  }
  if (context.contextualProductData) {
    userContent += '\n\nProduto de origem (página atual do usuário):\n'
    const expandedProduct = {
      id: context.contextualProductData.id,
      name: context.contextualProductData.name,
      price_usd: context.contextualProductData.price_usd,
      manufacturer: context.contextualProductData.manufacturer,
      category: context.contextualProductData.category,
      description: context.contextualProductData.description,
      technical_info: context.contextualProductData.technical_info,
      image_url: context.contextualProductData.image_url,
    }
    userContent += JSON.stringify(expandedProduct, null, 2)
  }
  messages.push({ role: 'user', content: userContent })
  return messages
}

async function callOpenAI(apiKey: string, model: string, messages: any[]): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenAI API error ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callDeepSeek(apiKey: string, model: string, messages: any[]): Promise<string> {
  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`DeepSeek API error ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: any[],
  systemPrompt: string,
): Promise<string> {
  const userMessages = messages.filter((m) => m.role !== 'system')
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: userMessages,
      max_tokens: 2000,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Anthropic API error ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  return data.content?.[0]?.text || ''
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
