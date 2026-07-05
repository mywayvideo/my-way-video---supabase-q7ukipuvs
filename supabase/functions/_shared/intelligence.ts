interface AgentProvider {
  id: string
  provider_name: string
  api_key_secret_name: string
  model_id: string
  is_active: boolean
  priority_order: number
  provider_type: string
  custom_endpoint: string | null
}

interface GenerateContext {
  agentSettings?: any
  aiSettings?: any
  products?: any[]
  manufacturerList?: string
  history?: any[]
  institutionalContext?: string
  currentProductId?: string | null
  contextualProductData?: any
}

export async function getActiveAgents(supabase: any): Promise<AgentProvider[]> {
  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority_order', { ascending: true })

  if (error) {
    console.error('[intelligence] Failed to fetch active agents:', error)
    return []
  }

  return (data || []) as AgentProvider[]
}

function buildSystemPrompt(ctx: GenerateContext): string {
  const agentSettings = ctx.agentSettings?.[0] || ctx.agentSettings || {}
  const aiSettings = ctx.aiSettings?.[0] || ctx.aiSettings || {}

  let prompt = aiSettings?.system_prompt_template || agentSettings?.system_prompt || ''

  prompt += '\n\nVocê é um consultor de e-commerce de audiovisual profissional.'

  if (ctx.institutionalContext) {
    prompt += `\n\nContexto institucional:\n${ctx.institutionalContext}`
  }

  if (ctx.manufacturerList) {
    prompt += `\n\nFabricantes disponíveis: ${ctx.manufacturerList}`
  }

  if (ctx.products && ctx.products.length > 0) {
    prompt += `\n\nProdutos encontrados:\n${JSON.stringify(ctx.products, null, 2)}`
  }

  if (ctx.contextualProductData) {
    prompt += `\n\nProduto atualmente visualizado:\n${JSON.stringify(ctx.contextualProductData, null, 2)}`
  }

  prompt += `\n\nResponda sempre em português. Se encontrar produtos relevantes, inclua os IDs dos produtos no campo referenced_internal_products. Determine o nível de confiança (low, medium, high). Se a pergunta não for relacionada a produtos ou serviços, defina should_show_whatsapp_button como false.`

  return prompt
}

function buildMessages(query: string, ctx: GenerateContext) {
  const systemPrompt = buildSystemPrompt(ctx)
  const messages: any[] = [{ role: 'system', content: systemPrompt }]

  if (ctx.history && ctx.history.length > 0) {
    for (const msg of ctx.history.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  messages.push({ role: 'user', content: query })
  return messages
}

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: any[],
): Promise<any> {
  const response = await fetch(endpoint, {
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

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AI API error ${response.status}: ${text}`)
  }

  return await response.json()
}

export async function generateResponse(
  query: string,
  ctx: GenerateContext,
  _unused: undefined,
  supabase: any,
): Promise<{
  content: string
  confidence_level: string
  referenced_internal_products: string[]
  should_show_whatsapp_button: boolean
}> {
  const agents = await getActiveAgents(supabase)
  if (agents.length === 0) {
    throw new Error('Nenhum provedor de IA ativo.')
  }

  const messages = buildMessages(query, ctx)
  const agent = agents[0]

  const apiKey = Deno.env.get(agent.api_key_secret_name) || Deno.env.get('OPENAI_API_KEY') || ''

  let endpoint = 'https://api.openai.com/v1/chat/completions'
  if (agent.provider_type === 'openai' || agent.provider_type === 'custom') {
    endpoint = agent.custom_endpoint || endpoint
  } else if (agent.provider_type === 'deepseek') {
    endpoint = 'https://api.deepseek.com/v1/chat/completions'
  } else if (agent.provider_type === 'anthropic') {
    endpoint = 'https://api.anthropic.com/v1/messages'
  }

  const model = agent.model_id || 'gpt-4o-mini'

  let content = ''
  try {
    const result = await callOpenAICompatible(endpoint, apiKey, model, messages)
    content =
      result?.choices?.[0]?.message?.content ||
      result?.content?.[0]?.text ||
      'Não foi possível gerar uma resposta no momento.'
  } catch (err) {
    console.error('[intelligence] AI call failed:', err)
    content = 'Desculpe, houve um erro ao processar sua solicitação. Tente novamente.'
  }

  const agentSettings = ctx.agentSettings?.[0] || ctx.agentSettings || {}

  let referencedProducts: string[] = []
  const productIds = ctx.products?.map((p: any) => p.id).filter(Boolean) || []
  if (productIds.length > 0) {
    referencedProducts = productIds.slice(0, 5)
  }

  const confidenceLevel = productIds.length > 0 ? 'high' : 'medium'

  const shouldShowWhatsApp =
    agentSettings.whatsapp_trigger_low_confidence === true && confidenceLevel === 'low'

  return {
    content,
    confidence_level: confidenceLevel,
    referenced_internal_products: referencedProducts,
    should_show_whatsapp_button: shouldShowWhatsApp,
  }
}
