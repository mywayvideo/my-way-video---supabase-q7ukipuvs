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

interface ParsedResult {
  content: string
  referenced_internal_products: string[]
  confidence_level: string
  should_show_whatsapp_button: boolean
}

const PARSE_ERROR_MESSAGE =
  'Desculpe, não pude processar a sua resposta no momento. Tente novamente.'

const DEFAULT_PARSED_RESULT: ParsedResult = {
  content: PARSE_ERROR_MESSAGE,
  referenced_internal_products: [],
  confidence_level: 'low',
  should_show_whatsapp_button: false,
}

const JSON_FORMAT_INSTRUCTIONS = `
## FORMATO DE RESPOSTA OBRIGATÓRIO (JSON)

Sua resposta DEVE ser um JSON válido com os seguintes campos:
- "content": string contendo markdown (use ## para títulos, ### para subtítulos, - para listas, e | para tabelas).
- "referenced_internal_products": array de strings contendo os UUIDs de todos os produtos mencionados ou comparados.
- "confidence_level": limite os valores a "high", "medium", ou "low".
- "should_show_whatsapp_button": boolean.

NUNCA retorne {message: ...} — o campo correto é "content".

Exemplo de resposta:
{"content": "## Título\\n\\nTexto", "referenced_internal_products": ["uuid1", "uuid2"], "confidence_level": "high", "should_show_whatsapp_button": false}`

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

    if (aiSettings?.product_page_prompt) {
      prompt += `\n\n${aiSettings.product_page_prompt}`
    }

    prompt += JSON_FORMAT_INSTRUCTIONS
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

function getProviderEndpoint(agent: AgentProvider): string {
  if (agent.provider_type === 'openai' || agent.provider_type === 'custom') {
    return agent.custom_endpoint || 'https://api.openai.com/v1/chat/completions'
  }
  if (agent.provider_type === 'deepseek') {
    return 'https://api.deepseek.com/v1/chat/completions'
  }
  if (agent.provider_type === 'anthropic') {
    return agent.custom_endpoint || 'https://api.anthropic.com/v1/messages'
  }
  return 'https://api.openai.com/v1/chat/completions'
}

function parseResult(result: any): ParsedResult {
  const rawContent =
    result?.choices?.[0]?.message?.content || result?.content?.[0]?.text || result?.content || ''

  if (!rawContent) {
    console.error(
      `[intelligence] parseResult: no content found in result keys=${Object.keys(result || {}).join(',')}`,
    )
    console.error('[intelligence] parseResult: no content or message field in response')
    return { ...DEFAULT_PARSED_RESULT }
  }

  if (typeof rawContent === 'string') {
    try {
      const trimmed = rawContent.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed)
        const content = parsed?.content ?? parsed?.message

        if (content === undefined || content === null) {
          console.error('[intelligence] parseResult: no content or message field in response')
          return { ...DEFAULT_PARSED_RESULT }
        }

        return {
          content: String(content),
          referenced_internal_products: Array.isArray(parsed?.referenced_internal_products)
            ? parsed.referenced_internal_products.map(String)
            : [],
          confidence_level: ['high', 'medium', 'low'].includes(parsed?.confidence_level)
            ? parsed.confidence_level
            : 'medium',
          should_show_whatsapp_button: Boolean(parsed?.should_show_whatsapp_button),
        }
      }
    } catch {
      // Not valid JSON — treat as plain text content
    }
  }

  if (typeof rawContent === 'object' && rawContent !== null) {
    const content = rawContent?.content ?? rawContent?.message

    if (content === undefined || content === null) {
      console.error('[intelligence] parseResult: no content or message field in response')
      return { ...DEFAULT_PARSED_RESULT }
    }

    return {
      content: String(content),
      referenced_internal_products: Array.isArray(rawContent?.referenced_internal_products)
        ? rawContent.referenced_internal_products.map(String)
        : [],
      confidence_level: ['high', 'medium', 'low'].includes(rawContent?.confidence_level)
        ? rawContent.confidence_level
        : 'medium',
      should_show_whatsapp_button: Boolean(rawContent?.should_show_whatsapp_button),
    }
  }

  return {
    content: String(rawContent),
    referenced_internal_products: [],
    confidence_level: 'medium',
    should_show_whatsapp_button: false,
  }
}

async function callProvider(
  agent: AgentProvider,
  apiKey: string,
  model: string,
  messages: any[],
): Promise<any> {
  const url = getProviderEndpoint(agent)
  const maxTokens = 4096

  let body: any
  let headers: Record<string, string>

  if (agent.provider_type === 'anthropic') {
    const systemMessage = messages.find((m) => m.role === 'system')
    const conversationMessages = messages.filter((m) => m.role !== 'system')

    body = {
      model,
      messages: conversationMessages,
      max_tokens: maxTokens,
      temperature: 0.3,
      ...(systemMessage ? { system: systemMessage.content } : {}),
    }

    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  } else {
    body = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    }

    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
  }

  console.log(
    `[intelligence] calling provider=${agent.provider_name} model=${model} url=${url} max_tokens=${body.max_tokens}`,
  )

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  console.log(`[intelligence] provider response status=${res.status} ok=${res.ok}`)

  const rawText = await res.text()

  console.log(
    `[intelligence] raw response length=${rawText.length}, first500=${rawText.slice(0, 500)}`,
  )

  if (!res.ok) {
    throw new Error(`AI API error ${res.status}: ${rawText}`)
  }

  let parsed: any
  try {
    parsed = JSON.parse(rawText)
  } catch (parseErr: any) {
    console.error(
      `[intelligence] JSON.parse failed: ${parseErr?.message?.slice(0, 200)}, rawLength=${rawText.length}, rawStart=${rawText.slice(0, 200)}`,
    )
    throw new Error(`Failed to parse AI response JSON: ${parseErr?.message}`)
  }

  return parsed
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

  const model = agent.model_id || 'gpt-4o-mini'

  let parsedResult: ParsedResult
  try {
    const result = await callProvider(agent, apiKey, model, messages)
    parsedResult = parseResult(result)
  } catch (err) {
    console.error('[intelligence] AI call failed:', err)
    parsedResult = {
      content: 'Desculpe, houve um erro ao processar sua solicitação. Tente novamente.',
      referenced_internal_products: [],
      confidence_level: 'low',
      should_show_whatsapp_button: false,
    }
  }

  const agentSettings = ctx.agentSettings?.[0] || ctx.agentSettings || {}

  let referencedProducts = parsedResult.referenced_internal_products
  if (referencedProducts.length === 0) {
    const productIds = ctx.products?.map((p: any) => p.id).filter(Boolean) || []
    if (productIds.length > 0) {
      referencedProducts = productIds.slice(0, 5)
    }
  }

  let confidenceLevel = parsedResult.confidence_level
  if (confidenceLevel === 'medium' && referencedProducts.length > 0) {
    confidenceLevel = 'high'
  }

  let shouldShowWhatsApp = parsedResult.should_show_whatsapp_button
  if (agentSettings.whatsapp_trigger_low_confidence === true && confidenceLevel === 'low') {
    shouldShowWhatsApp = true
  }

  console.log(
    `[intelligence] generateResponse result: content_length=${parsedResult.content.length} referenced_products=${JSON.stringify(referencedProducts)} confidence=${confidenceLevel} whatsapp=${shouldShowWhatsApp}`,
  )

  return {
    content: parsedResult.content,
    confidence_level: confidenceLevel,
    referenced_internal_products: referencedProducts,
    should_show_whatsapp_button: shouldShowWhatsApp,
  }
}
