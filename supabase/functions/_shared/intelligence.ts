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
  marketIntelligence?: Array<{
    title: string
    ai_summary: string | null
    source_url: string | null
    event_name: string | null
    created_at: string
  }>
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
      max_tokens: 4000,
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
    max_tokens: 4000,
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
    `REGRA DE GROUNDING (OBRIGATÓRIO E SEVERO — 4 PONTOS):\n` +
    `1. Você é PROIBIDA de inventar, alucinar ou citar nomes de produtos, marcas, fabricantes, SKUs ou preços que não estejam explicitamente presentes no array de produtos recebido do banco de dados na mensagem atual.\n` +
    `2. Se o usuário perguntar sobre um produto que NÃO está no catálogo (ausente do array de produtos recebido) E não existirem dados de Inteligência de Mercado (MI) relevantes no contexto, você deve informar ao usuário que o item não existe no catálogo, SEM fornecer preço, especificação ou qualquer outra informação sobre ele. No entanto, se existirem dados de Inteligência de Mercado (MI) relevantes no contexto, você DEVE usar esses dados de MI para responder à pergunta, independentemente da intenção classificada (catálogo, comparação, compatibilidade, técnica, etc.). Os dados de MI são informações curadas e verificadas — usar esses dados para responder NÃO constitui alucinação. Quando o array de produtos estiver vazio mas existirem dados de MI relevantes, a resposta deve ser baseada exclusivamente no conteúdo de MI disponível, explorando-o integralmente (título, resumo, fonte, evento). A presença de dados de MI é condição suficiente para gerar uma resposta completa — você não deve exibir a mensagem padrão de recusa quando houver conteúdo de MI relevante.\n` +
    `3. Se a pergunta exigir "Análise por Produto" ou "Comparativo Técnico" e NÃO houver produtos correspondentes no banco de dados, você NÃO deve criar essas seções com modelos fictícios. Você deve informar imediatamente que o item não está no catálogo.\n` +
    `4. O fato de um nome ser mencionado na pergunta do usuário NÃO significa que o produto existe no catálogo. A ÚNICA fonte de verdade é o array de produtos fornecido na mensagem atual.`,
  )

  parts.push(
    `REGRA DE ISOLAMENTO DE HISTÓRICO (OBRIGATÓRIO):\n` +
    `Produtos, marcas, modelos ou preços citados em mensagens anteriores da conversa NÃO devem ser tratados como itens do catálogo.\n` +
    `A ÚNICA fonte de verdade é o array de produtos fornecido na mensagem atual.\n` +
    `Se um produto foi mencionado anteriormente na conversa, mas NÃO está presente no array de produtos atual, você deve informar ao usuário que ele não existe no catálogo.`,
  )

  parts.push(
    `REGRA DE IDENTIFICADORES (OBRIGATÓRIO — SIGA EXATAMENTE):\n` +
    `1. Sempre que você mencionar um produto no texto (títulos, listas, tabelas, parágrafos), você DEVE inserir imediatamente após o nome do produto o token [PRODUCT:UUID] usando o UUID exato fornecido no contexto (o mesmo UUID que aparece no token [PRODUCT:UUID] recebido na mensagem).\n` +
    `2. Estes tokens [PRODUCT:UUID] são INTERNOSS e serão removidos automaticamente pelo sistema antes de exibir a resposta ao usuário. Portanto, NÃO os remova você mesma — insira-os sempre que mencionar um produto.\n` +
    `3. Em seções como "Análise por Produto" ou "Comparativo Técnico", TODOS os produtos mencionados DEVEM ter o token [PRODUCT:UUID] inserido imediatamente após o nome do produto, sem exceção.\n` +
    `4. É PROIBIDO exibir UUIDs isolados ou quaisquer outros identificadores técnicos/internos que não sejam o token [PRODUCT:UUID]. O usuário nunca deve ver UUIDs soltos, IDs numéricos, ou tokens diferentes de [PRODUCT:UUID].\n` +
    `5. O nome limpo do produto deve sempre aparecer antes do token. Exemplo correto: "Sony FX3 [PRODUCT:abc12345-...]". Exemplo incorreto: exibir apenas o UUID sem o nome, ou omitir o token.`,
  )

  parts.push(
    `HIERARQUIA DE PREÇOS (OBRIGATÓRIO — SIGA EXATAMENTE):\n` +
    `Existem quatro campos de preço no catálogo. Siga a hierarquia abaixo para decidir qual preço exibir:\n\n` +
    `1. price_usd → Preço de venda do produto na origem (Miami). É o preço que o cliente paga para retirar o produto em nosso armazen em Doral, FL 33126. Este preço deve ser SEMPRE exibido com prioridade — é o preço padrão de exibição por padrão.\n\n` +
    `2. price_brl → Um preço que o sistema calcula automaticamente no cadastro do produto, considerando o custo aproximado de envio para SP. IMPORTANTE: price_brl está SEMPRE expresso em US$ (dólar), NUNCA em reais. Este preço NÃO deve ser exibido por padrão — é usado apenas como referência quando o cliente pergunta sobre o preço entregue no Brasil E não existe price_nationalized_sales registrado.\n\n` +
    `3. price_nationalized_sales → Preço de venda do produto para entrega em SP. Pode estar em US$ (dólar) ou R$ (real), conforme indicado pelo campo price_nationalized_currency. Se o cliente perguntar sobre o preço do produto no Brasil, este é o valor MAIS PRECISO a ser utilizado.\n\n` +
    `4. price_nationalized_currency → Indica a moeda de price_nationalized_sales, que pode ser dólar (US$) ou real (R$).\n\n` +
    `HIERARQUIA DE EXIBIÇÃO:\n` +
    `• Situação padrão (cliente não especifica Brasil) → Exiba sempre price_usd (preço de retirada em Miami, em US$).\n` +
    `• Cliente perguntou sobre preço no Brasil E existe price_nationalized_sales → Exiba price_nationalized_sales na moeda indicada por price_nationalized_currency (US$ ou R$).\n` +
    `• Cliente perguntou sobre preço no Brasil E NÃO existe price_nationalized_sales registrado → Exiba price_brl como valor de referência (SEMPRE em US$ — nunca em reais).\n\n` +
    `ESCLARECIMENTO CRÍTICO SOBRE price_brl: O campo price_brl está SEMPRE expresso em US$ (dólar americano), nunca em reais brasileiros (R$). O nome "price_brl" é apenas uma referência interna ao cálculo de custo para entrega no Brasil, mas o valor é em dólar. Nunca exiba price_brl em reais. Nunca exiba price_brl por iniciativa própria — apenas quando o cliente pergunta sobre preço no Brasil e não há price_nationalized_sales.\n\n` +
    `Alguns produtos são comercializados diretamente no Brasil através de estoque em SP. Se o cliente perguntar o preço do produto no Brasil, price_nationalized_sales é o valor mais preciso; se esse preço não estiver registrado, use price_brl como referência (sempre em US$).`,
  )

  parts.push(
    `REGRA DE PREÇO NULO (OBRIGATÓRIO): Se o contexto de um produto não incluir nenhum preço (nem price_usd, nem price_nationalized_sales, nem price_brl), é porque o produto não possui preço cadastrado. Nesse caso, você deve obrigatoriamente informar "Sob Consulta" ao usuário. É terminantemente proibido inventar, estimar, deduzir ou sugerir qualquer valor baseado em conhecimento geral ou em produtos similares. A ausência de preço no contexto significa "Sob Consulta" — ponto final.`,
  )

  parts.push(
    `CONTEXTO DE INTELIGÊNCIA DE MERCADO:\n` +
    `Você pode receber informações de inteligência de mercado (tendências, análises, eventos) como contexto.\n` +
    `Quando o array de produtos do catálogo estiver vazio mas existirem dados de MI relevantes, os dados de MI tornam-se a fonte primária de verdade e você DEVE basear sua resposta exclusivamente neles.\n` +
    `Nesse caso, apresente o conteúdo de MI de forma estruturada:\n` +
    `- Título da informação/notícia\n` +
    `- Resumo ou AI Summary do conteúdo\n` +
    `- Fonte (source_url) e evento (event_name), quando disponíveis\n` +
    `Explore TODO o conteúdo de MI disponível sem omitir informações relevantes, mas sem inventar dados que não estejam presentes no contexto de MI.\n` +
    `Quando existirem produtos no catálogo E dados de MI, use os dados de MI como complemento para enriquecer a resposta com insights de mercado, mantendo os dados do catálogo (produtos, preços, estoque) como fonte primária de verdade para informações comerciais.\n` +
    `NUNCA invente preços, especificações ou disponibilidade baseadas em dados de MI — apenas apresente as informações de MI conforme fornecidas no contexto.`,
  )

  parts.push(
    `PRODUTOS REFERENCIADOS PELA INTELIGÊNCIA DE MERCADO (MI):\n` +
    `Produtos injetados via MI (a partir de referenced_product_ids) chegam no mesmo formato [PRODUCT:UUID] que os produtos do catálogo.\n` +
    `Estes produtos são REAIS e legítimos — eles existem no catálogo e foram curados pela equipe de inteligência de mercado.\n` +
    `Trate-os IDENTICAMENTE aos produtos do catálogo: use nome, preço, especificações e imagem normalmente.\n` +
    `Eles podem ser usados em "Análise por Produto", "Comparativo Técnico" e na inserção de marcadores de imagem <!-- PRODUCT_IMAGE:UUID -->.\n` +
    `A regra de grounding permanece válida: nunca invente produtos fora do array fornecido. No entanto, como os produtos MI estão no array, eles são legítimos e devem ser tratados como qualquer outro produto do catálogo.`,
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
      if (natPrice)
        userContent += ` | [INTERNO - não exibir a menos que solicitado] Preço Brasil: ${natPrice}`
      if (brlRefPrice)
        userContent += ` | [INTERNO - não exibir a menos que solicitado] Ref. Brasil: ${brlRefPrice}`
      if (!usdPrice && !natPrice && !brlRefPrice)
        userContent += ` | Preço: Sob Consulta`
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

  if (context.marketIntelligence && context.marketIntelligence.length > 0) {
    userContent += '\n\nInteligência de Mercado (contexto complementar):\n'
    for (const mi of context.marketIntelligence) {
      userContent += `- ${mi.title}`
      if (mi.ai_summary) userContent += `: ${mi.ai_summary}`
      if (mi.source_url) userContent += ` (Fonte: ${mi.source_url})`
      if (mi.event_name) userContent += ` (Evento: ${mi.event_name})`
      userContent += '\n'
    }
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
          max_tokens: 4000,
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
