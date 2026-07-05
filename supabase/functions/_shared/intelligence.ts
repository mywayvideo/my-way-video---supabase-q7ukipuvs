import { createClient } from 'jsr:@supabase/supabase-js@2'

interface Agent {
  id: string
  provider_name: string
  model_id: string
  provider_type: string
  custom_endpoint: string | null
  api_key_secret_name: string | null
  priority: number | null
}

interface GenerateContext {
  agentSettings?: any
  aiSettings?: any
  institutionalContext?: string
  history?: any[]
  products?: any[]
  manufacturerList?: string
  currentProductId?: string | null
  contextualProductData?: any
}

interface GenerateResult {
  content: string
  confidence_level: string
  referenced_internal_products: string[]
  should_show_whatsapp_button: boolean
}

export async function getActiveAgents(supabase: ReturnType<typeof createClient>): Promise<Agent[]> {
  const { data, error } = await supabase
    .from('ai_providers')
    .select(
      'id, provider_name, model_id, provider_type, custom_endpoint, api_key_secret_name, priority',
    )
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (error || !data) return []
  return data as Agent[]
}

function getApiKey(agent: Agent): string {
  const secretName = agent.api_key_secret_name || ''
  const envKey = secretName.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  if (agent.provider_type === 'openai' || agent.provider_name?.toLowerCase().includes('openai')) {
    return Deno.env.get('OPENAI_API_KEY') ?? ''
  }
  if (
    agent.provider_type === 'anthropic' ||
    agent.provider_name?.toLowerCase().includes('anthropic')
  ) {
    return Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  }
  if (
    agent.provider_type === 'deepseek' ||
    agent.provider_name?.toLowerCase().includes('deepseek')
  ) {
    return Deno.env.get('DEEPSEEK_API_KEY') ?? ''
  }
  return Deno.env.get(envKey) ?? Deno.env.get(secretName) ?? ''
}

function buildSystemPrompt(context: GenerateContext): string {
  const agentSettings = context.agentSettings || {}
  const aiSettings = context.aiSettings || {}
  const basePrompt = agentSettings.system_prompt || aiSettings.system_prompt_template || ''
  const logisticsRules = aiSettings.logistics_rules_prompt || ''
  const productPagePrompt = aiSettings.product_page_prompt || ''

  let systemPrompt = basePrompt
  if (context.institutionalContext) {
    systemPrompt += `\n\nContexto institucional:\n${context.institutionalContext}`
  }
  if (context.manufacturerList) {
    systemPrompt += `\n\nFabricantes disponíveis: ${context.manufacturerList}`
  }
  if (logisticsRules) {
    systemPrompt += `\n\nRegras de logística:\n${logisticsRules}`
  }
  if (context.products && context.products.length > 0) {
    systemPrompt += `\n\nProdutos encontrados:\n${JSON.stringify(context.products)}`
  }
  if (context.contextualProductData) {
    systemPrompt += `\n\nProduto atualmente em visualização:\n${JSON.stringify(context.contextualProductData)}`
  }
  if (productPagePrompt && context.currentProductId) {
    systemPrompt += `\n\n${productPagePrompt}`
  }
  return systemPrompt
}

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userQuery: string,
  history: any[],
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: userQuery },
  ]

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

function extractProductIds(content: string, products: any[]): string[] {
  const ids: string[] = []
  if (!products || products.length === 0) return ids
  for (const p of products) {
    const pid = p.id || p.product_id
    if (pid && (content.includes(pid) || content.includes(p.name || p.title || ''))) {
      ids.push(pid)
    }
  }
  return [...new Set(ids)]
}

function determineConfidence(content: string, hasProducts: boolean): string {
  const lowerContent = content.toLowerCase()
  if (
    lowerContent.includes('não tenho certeza') ||
    lowerContent.includes('não sei') ||
    lowerContent.includes('incerto')
  ) {
    return 'low'
  }
  if (hasProducts) return 'high'
  return 'medium'
}

function shouldShowWhatsApp(agentSettings: any, confidence: string): boolean {
  const threshold = agentSettings.confidence_threshold_for_whatsapp || 'low'
  const levels = ['low', 'medium', 'high']
  const thresholdIdx = levels.indexOf(threshold)
  const confidenceIdx = levels.indexOf(confidence)
  return confidenceIdx <= thresholdIdx
}

export async function generateResponse(
  query: string,
  context: GenerateContext,
  _unused: any,
  supabase: ReturnType<typeof createClient>,
): Promise<GenerateResult> {
  const agents = await getActiveAgents(supabase)
  if (agents.length === 0) {
    throw new Error('Nenhum provedor de IA ativo configurado.')
  }

  const systemPrompt = buildSystemPrompt(context)
  const history = context.history || []
  const products = context.products || []
  let content = ''

  for (const agent of agents) {
    try {
      const apiKey = getApiKey(agent)
      if (!apiKey) continue

      let endpoint = 'https://api.openai.com/v1/chat/completions'
      if (agent.provider_type === 'deepseek') {
        endpoint = 'https://api.deepseek.com/v1/chat/completions'
      } else if (agent.custom_endpoint) {
        endpoint = agent.custom_endpoint
      } else if (agent.provider_type === 'anthropic') {
        endpoint = 'https://api.anthropic.com/v1/messages'
      }

      if (agent.provider_type === 'anthropic') {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: agent.model_id,
            system: systemPrompt,
            messages: [
              ...history.slice(-10).map((h: any) => ({ role: h.role, content: h.content })),
              { role: 'user', content: query },
            ],
            max_tokens: 2000,
          }),
        })
        if (!response.ok) continue
        const data = await response.json()
        content = data.content?.[0]?.text || ''
      } else {
        content = await callOpenAICompatible(
          endpoint,
          apiKey,
          agent.model_id,
          systemPrompt,
          query,
          history,
        )
      }

      if (content) break
    } catch (err) {
      console.error(`[intelligence] Agent ${agent.provider_name} failed:`, err)
      continue
    }
  }

  if (!content) {
    content =
      'Desculpe, não foi possível processar sua solicitação no momento. Tente novamente em instantes.'
  }

  const referencedProducts = extractProductIds(content, products)
  const confidence = determineConfidence(content, referencedProducts.length > 0)
  const showWhatsApp = shouldShowWhatsApp(context.agentSettings || {}, confidence)

  return {
    content,
    confidence_level: confidence,
    referenced_internal_products: referencedProducts,
    should_show_whatsapp_button: showWhatsApp,
  }
}
