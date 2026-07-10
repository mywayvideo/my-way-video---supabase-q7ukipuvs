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

export async function getActiveAgents(supabase: any): Promise<AgentConfig[]> {
  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true })
  if (error || !data || data.length === 0) return []
  return data as AgentConfig[]
}

interface GenerateContext {
  agentSettings?: any
  aiSettings?: any
  products?: any[]
  manufacturerList?: string
  history?: any[]
  currentProductId?: string | null
  contextualProductData?: any
  institutionalContext?: string
  productPagePrompt?: string
  currentProductContext?: {
    id?: string
    name?: string
    manufacturer?: string
    category?: string
  }
}

export async function generateResponse(
  query: string,
  context: GenerateContext,
  _modelOverride: any,
  supabase: any,
): Promise<any> {
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
  console.log(`[intelligence] productPagePrompt presente: ${!!context.productPagePrompt}`)
  console.log(
    `[intelligence] agentSettings present=${!!context.agentSettings} system_prompt_length=${(context.agentSettings?.system_prompt || '').length}`,
  )
  const agentSettings = context.agentSettings
  const aiSettings = context.aiSettings
  let prompt = agentSettings?.system_prompt || aiSettings?.system_prompt_template || ''
  prompt +=
    '\n\nVocê é um assistente de IA especializado em equipamentos audiovisuais profissionais.'
  prompt += '\nResponda sempre em português brasileiro, de forma clara e objetiva.'
  prompt +=
    '\nQuando mencionar produtos do catálogo, inclua o ID do produto na resposta usando o formato [PRODUCT:id].'
  prompt += '\n\nREGRAS DE REFERÊNCIA DE PRODUTOS (referenced_internal_products):'
  prompt +=
    '\n- Densidade Mínima: Para buscas de categoria, inclua pelo menos os 6 IDs de produtos mais relevantes usando o formato [PRODUCT:id].'
  prompt +=
    '\n- Diversidade de Fabricantes: Para buscas de categoria, os IDs referenciados devem representar diferentes fabricantes (ex: Sony, Canon, Datavideo, Blackmagic).'
  prompt +=
    '\n- Integridade de Comparação: Para consultas de comparação, pelo menos ambos os produtos comparados (mínimo 2) devem ser referenciados.'
  prompt +=
    '\n- Política de Não-Vazio: O array de produtos referenciados nunca deve estar vazio se a busca retornou produtos válidos.'
  if (context.manufacturerList) {
    prompt += `\n\nFabricantes disponíveis: ${context.manufacturerList}`
  }
  prompt += '\n\nREGRAS DE PREÇOS E COTAÇÃO:'
  prompt += '\n- Priorize sempre o preço em USD (FOB Miami) quando o valor for maior que 0.'
  prompt +=
    '\n- Se o preço USD for 0 ou nulo, NÃO invente ou alucine um preço. Informe que o preço está indisponível.'
  prompt +=
    '\n- O preço nacionalizado (price_nationalized_sales) só deve ser mencionado se o usuário perguntar explicitamente sobre preços no Brasil ou em reais.'
  prompt +=
    '\n- Use price_nationalized_currency para associar o símbolo correto (USD/BRL) ao preço nacionalizado.'
  prompt += '\n- NUNCA mencione custos internos, preços de custo ou margens de lucro.'
  if (context.institutionalContext) {
    prompt += `\n\nInformações institucionais:\n${context.institutionalContext}`
  }
  if (context.productPagePrompt && context.currentProductContext) {
    const resolved = context.productPagePrompt
      .replace(/\{\{productName\}\}/g, context.currentProductContext.name || '')
      .replace(/\{\{manufacturer\}\}/g, context.currentProductContext.manufacturer || '')
      .replace(/\{\{category\}\}/g, context.currentProductContext.category || '')
      .replace(/\{\{currentProductId\}\}/g, context.currentProductContext.id || '')
    prompt += `\n\n### INSTRUÇÕES DA PÁGINA DO PRODUTO\n${resolved}`
  }
  return prompt
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
    userContent += JSON.stringify(context.products, null, 2)
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
    productIds.push(match[1])
  }
  const cleanedContent = content.replace(idRegex, '').trim()

  const hasProductMatch = productIds.length > 0
  const confidenceLevel = hasProductMatch ? 'high' : 'medium'

  const shouldShowWhatsApp =
    confidenceLevel === 'low' || (!hasProductMatch && !context.institutionalContext)

  return {
    content: cleanedContent,
    confidence_level: confidenceLevel,
    referenced_internal_products: productIds,
    ai_referenced_products: productIds,
    should_show_whatsapp_button: shouldShowWhatsApp,
  }
}
