export function safeJSONParse(str: string, fallback: any = null): any {
  try {
    return JSON.parse(str)
  } catch {}
  const cleaned = str
    .trim()
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {}
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(cleaned.slice(first, last + 1))
    } catch {}
  }
  return fallback
}

export async function getActiveAgents(supabaseClient: any) {
  const { data } = await supabaseClient
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority_order', { ascending: true })
  return data || []
}

export async function generateResponse(
  query: string,
  unifiedData: any = {},
  agentId?: string,
  supabaseClient?: any,
) {
  const sc = supabaseClient
  const agentSettings = unifiedData.agentSettings || {}
  const aiSettings = unifiedData.aiSettings || {}

  const rawProducts = unifiedData.products || []
  const contextProducts = rawProducts.map((p: any) => {
    let effective_price_usd = p.price_usd || 0
    if (p.price_usa_rebate > 0 && (!p.date_rebate || new Date(p.date_rebate) >= new Date())) {
      effective_price_usd = p.price_usa_rebate
    }
    return { ...p, effective_price_usd }
  })

  const institutionalContext = unifiedData.institutionalContext || ''
  const systemPrompt = agentSettings.system_prompt || ''
  const systemPromptTemplate = aiSettings.system_prompt_template || ''
  const logisticsRules = aiSettings.logistics_rules_prompt || ''
  const productPagePrompt = unifiedData.currentProductId ? aiSettings.product_page_prompt || '' : ''

  const productPageRules = unifiedData.currentProductId
    ? 'Esta conversa ocorre na Página de Produto. REGRAS: 1. Sugira APENAS produtos complementares. 2. PROIBIDO sugerir produtos da mesma categoria, A NÃO SER QUE o usuário solicite comparação.'
    : ''

  const goldenRules = `REGRAS DE OURO (JSON):
1. Resposta FINAL deve ser apenas JSON: {"message":"...","confidence_level":"high"|"low","referenced_internal_products":[],"should_show_whatsapp_button":boolean}
2. "referenced_internal_products" deve conter APENAS IDs dos produtos fornecidos.
2b. Para perguntas de listagem ou catálogo amplo (ex: 'quais câmeras PTZ 4K vocês têm'), referenced_internal_products DEVE conter os IDs de TODOS os produtos relevantes fornecidos em PRODUTOS, não apenas os citados nominalmente no texto.
3. IDs nunca devem aparecer no texto visível.
3b. Para perguntas de listagem ou catálogo amplo (ex: 'quais câmeras PTZ 4K vocês têm', 'mostre opções de X'), referenced_internal_products DEVE conter os IDs de TODOS os produtos relevantes fornecidos no contexto (PRODUTOS), não apenas os primeiros exemplos citados no texto. Nunca omita produtos do array apenas porque não foram citados nominalmente na resposta em texto corrido.
4. Formate em markdown. Insira imagens: ![Nome](image_url).
5. Para perguntas institucionais, "referenced_internal_products" vazio e "should_show_whatsapp_button" true.`

  let historyText = ''
  if (unifiedData.history?.length > 0) {
    historyText =
      '\n\nHISTÓRICO:\n' +
      unifiedData.history
        .slice(-6)
        .map((m: any) => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content}`)
        .join('\n')
  }

  const assembledPrompt = [
    systemPrompt,
    productPagePrompt,
    productPageRules,
    `CONTEXTO INSTITUCIONAL:\n${institutionalContext}`,
    systemPromptTemplate,
    `REGRAS DE LOGÍSTICA:\n${logisticsRules}`,
    `FABRICANTES:\n${unifiedData.manufacturerList || ''}`,
    goldenRules,
    `PRODUTOS:\n${JSON.stringify(contextProducts)}`,
    unifiedData.contextualProductData
      ? `PRODUTO ATUAL:\n${JSON.stringify(unifiedData.contextualProductData)}`
      : '',
    historyText,
  ]
    .filter(Boolean)
    .join('\n\n')

  const agents = await getActiveAgents(sc)
  const agentsToTry = agentId ? agents.filter((a: any) => a.id === agentId) : agents
  if (agentsToTry.length === 0) throw new Error('Nenhum provedor de IA ativo encontrado.')

  let data: any = null
  for (const agent of agentsToTry) {
    try {
      const res = await sc.functions.invoke('process-query', {
        body: {
          query,
          products: contextProducts,
          intelligence: unifiedData.intel || [],
          agentId: agent.id,
          assembledPrompt,
          temperature: 0.1,
        },
      })
      if (res.error) throw res.error
      data = res.data
      break
    } catch (err: any) {
      console.error(
        `[${new Date().toISOString()}] Provider "${agent.provider_name}" failed: ${err.message || err}`,
      )
    }
  }

  if (!data) {
    throw new Error(
      'Falha ao processar a busca em todos os provedores ativos. Tente novamente em instantes.',
    )
  }

  let result: any = data.message || data
  if (typeof result === 'string') {
    const parsed = safeJSONParse(result, null)
    if (parsed && typeof parsed === 'object') {
      result = parsed
    } else {
      result = { message: result }
    }
  }

  const content = result.message || result.content || (typeof result === 'string' ? result : '')
  let confidence = result.confidence_level || 'high'
  let showWhatsapp = result.should_show_whatsapp_button || false

  const contentLower = content
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (
    contentLower.includes('suporte') ||
    contentLower.includes('especialista') ||
    contentLower.includes('equipe')
  ) {
    confidence = 'low'
    showWhatsapp = true
  }

  let refs = result.referenced_internal_products || []
  if (!Array.isArray(refs) || refs.length === 0) {
    if (Array.isArray(result.products)) {
      refs = result.products.map((p: any) => (typeof p === 'string' ? p : p.id)).filter(Boolean)
    }
  }

  console.log(
    `[intelligence] refs received: ${JSON.stringify(refs)} contextProducts total: ${contextProducts.length}`,
  )
  let aiMentionedProducts = contextProducts.filter((p: any) => refs.includes(p.id))

  if (aiMentionedProducts.length === 0) {
    aiMentionedProducts = contextProducts.filter((p: any) => {
      if (!p.name) return false
      const name = p.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      const sku = p.sku
        ? p.sku
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
        : ''
      return contentLower.includes(name) || (sku && contentLower.includes(sku))
    })
  }

  console.log(
    `[intelligence] aiMentionedProducts fallback check: refs=${refs.length} contextProducts=${contextProducts.length} matchedByRefs=${aiMentionedProducts.length}`,
  )

  if (aiMentionedProducts.length === 0 && contextProducts.length > 0) {
    console.log(`[intelligence] fallback triggered: contextProducts=${contextProducts.length}`)
    aiMentionedProducts = contextProducts
  }

  return {
    content,
    products: aiMentionedProducts,
    referenced_internal_products: aiMentionedProducts.map((p: any) => p.id),
    should_show_whatsapp_button: showWhatsapp,
    confidence_level: confidence,
  }
}
