import { supabase } from '@/lib/supabase/client'

export async function getAISettings() {
  const { data: specificSettings } = await supabase
    .from('ai_settings')
    .select(
      'cache_expiration_days, price_threshold_usd, search_algorithm_sql, system_prompt_template, logistics_rules_prompt, result_component_config, ignore_stock_count',
    )
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const defaultSpecificSettings = specificSettings || {
    cache_expiration_days: 30,
    price_threshold_usd: 5000,
    search_algorithm_sql: '',
    system_prompt_template: '',
    logistics_rules_prompt: '',
    result_component_config: '{}',
    ignore_stock_count: false,
  }

  const { data: agentSettings } = await supabase
    .from('ai_agent_settings')
    .select(
      'whatsapp_trigger_low_confidence, whatsapp_trigger_purchase_keywords, whatsapp_trigger_project_keywords, whatsapp_trigger_expensive_product, confidence_threshold_for_whatsapp, max_web_search_attempts, whatsapp_trigger_keywords, system_prompt',
    )
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const defaultAgentSettings = agentSettings || {}

  return { ...defaultAgentSettings, ...defaultSpecificSettings }
}

export async function getActiveAgent() {
  const { data } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority_order', { ascending: true })

  return data && data.length > 0 ? data[0] : null
}

export async function getActiveAgents() {
  const { data } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority_order', { ascending: true })

  return data || []
}

export async function generateResponse(query: string, unifiedData: any = {}, agentId?: string) {
  // Read settings directly to synchronize authority
  const settings = await getAISettings()

  const genericFallback = 'Consultor My Way Business. Responda de forma técnica e objetiva.'

  let systemPrompt = settings.system_prompt || ''
  let systemPromptTemplate = settings.system_prompt_template || ''
  const logisticsRulesPrompt = settings.logistics_rules_prompt || ''

  if (!systemPrompt.trim() && !systemPromptTemplate.trim()) {
    systemPrompt = genericFallback
  }

  const rawProducts = unifiedData.products || unifiedData.stock || []
  const contextProducts = rawProducts.map((p: any) => {
    let effective_price_usd = p.price_usd || 0
    if (p.price_usa_rebate > 0) {
      if (!p.date_rebate || new Date(p.date_rebate) >= new Date()) {
        effective_price_usd = p.price_usa_rebate
      }
    }
    return { ...p, effective_price_usd }
  })
  const contextIntel = unifiedData.intel || []
  const contextNab = unifiedData.nabData || unifiedData.nab_data || []

  // Ensure prompt enforces exact rules to follow User Story constraints
  const strictRules = `MANDATORY RULES:
1. The AI MUST respond in the EXACT same language used in the user's last message.
2. The AI is FORBIDDEN from comparing products unless the user explicitly asks for a comparison.
3. All technical specifications MUST be in code blocks with triple backticks.
4. You MUST return the exact IDs of the referenced products in the "referenced_internal_products" array.
5. Convert all database logic into natural, professional commercial sentences. Do NOT output database field names (e.g., price_usd, stock_count) or logical conditions.
6. Paragraphs: Maximum 2 sentences.
7. If 'effective_price_usd' is provided for a product, use it as the base price_usd for calculations instead of the standard price_usd, as it represents an active rebate.
8. Ao realizar buscas, o campo SKU é tão importante quanto o nome. Se o usuário digitar um código técnico, priorize a correspondência exata por SKU.
9. IMPORTANTE: Se o produto não tiver preço cadastrado (0 ou nulo) tanto em USD quanto Nacionalizado, a disponibilidade é "Sob Consulta". NUNCA presuma que é estoque exclusivo do Brasil pela ausência de preço em USD.

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):
Retorne APENAS um objeto JSON válido com a seguinte estrutura. O campo content é a sua resposta em Markdown:
{
  "content": "Sua resposta formatada...",
  "referenced_internal_products": ["id_1", "id_2"] // OBRIGATÓRIO: Inclua TODOS os IDs exatos dos produtos mencionados.
}`

  const nabJson = [...contextIntel, ...contextNab].map((item: any) => {
    if (item.ai_summary) {
      return {
        title: item.title || '',
        ai_summary: item.ai_summary,
        raw_content: item.raw_content || item.content || '',
      }
    }
    return item
  })

  let historyText = ''
  if (unifiedData.history && unifiedData.history.length > 0) {
    const recentHistory = unifiedData.history.slice(-6)
    historyText = `\n\nHISTÓRICO RECENTE (Últimas 6 mensagens):\n${recentHistory.map((m: any) => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content}`).join('\n')}`
  }

  const { data: cData } = await supabase.from('company_info').select('content, type')
  const contexto_institucional = (cData || [])
    .map((c: any) => `[${c.type}]: ${c.content}`)
    .join('\n')

  const KNOWLEDGE_BASE = `
1) Contexto Institucional:
${contexto_institucional}

2) Produtos Encontrados:
${JSON.stringify(contextProducts)}

3) Inteligência de Mercado:
${JSON.stringify(nabJson)}
`

  const finalPromptWithContext = `${systemPrompt}\n\n${systemPromptTemplate}\n\n${logisticsRulesPrompt}\n\n${strictRules}\n\nKNOWLEDGE_BASE:\n${KNOWLEDGE_BASE}\n\n${historyText}`

  const agents = await getActiveAgents()
  const agentsToTry = agentId ? agents.filter((a) => a.id === agentId) : agents

  if (agentsToTry.length === 0) {
    throw new Error('Nenhum provedor de IA ativo encontrado.')
  }

  let data: any = null

  // Triggers - read directly from settings to maintain admin sovereignty
  const whatsappTriggers = settings.whatsapp_trigger_keywords || []

  for (const agent of agentsToTry) {
    try {
      const res = await supabase.functions.invoke('process-query', {
        body: {
          query: query,
          products: contextProducts,
          intelligence: nabJson,
          agentId: agent.id,
          assembledPrompt: finalPromptWithContext,
          price_threshold_usd: settings.price_threshold_usd,
          whatsapp_triggers: whatsappTriggers,
          temperature: 0.1,
        },
      })

      if (res.error) throw res.error
      data = res.data
      break
    } catch (err) {
      console.error(`Error invoking process-query with agent ${agent.provider_name}:`, err)
    }
  }

  if (!data) {
    throw new Error('Falha ao invocar a engine de inteligência em todos os provedores ativos.')
  }

  let result = data.message || data
  if (typeof result === 'string') {
    try {
      const start = result.indexOf('{')
      const end = result.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        result = JSON.parse(result.substring(start, end + 1))
      } else {
        result = JSON.parse(result)
      }
    } catch (e) {
      // Keep as string if not JSON
    }
  }

  const content = result.content || result.message || (typeof result === 'string' ? result : '')
  let confidence = result.confidence_level || 'high'
  let showWhatsapp = result.should_show_whatsapp_button || false

  const contentLowerCheck = content
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (
    contentLowerCheck.includes('suporte') ||
    contentLowerCheck.includes('especialista') ||
    contentLowerCheck.includes('equipe')
  ) {
    confidence = 'low'
    showWhatsapp = true
  }

  let aiMentionedProducts: any[] = []
  let refs = result.referenced_internal_products || []
  if (!Array.isArray(refs) || refs.length === 0) {
    if (result.products && Array.isArray(result.products)) {
      refs = result.products.map((p: any) => (typeof p === 'string' ? p : p.id)).filter(Boolean)
    }
  }

  if (refs && Array.isArray(refs) && refs.length > 0) {
    aiMentionedProducts = contextProducts.filter((p: any) => refs.includes(p.id))
  }

  // Fallback text matching to ensure products mentioned are always displayed
  const contentLowerCheckStr = content
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const queryLowerCheckStr = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

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

      const inContent =
        contentLowerCheckStr.includes(name) || (sku && contentLowerCheckStr.includes(sku))
      const inQuery = queryLowerCheckStr.includes(name) || (sku && queryLowerCheckStr.includes(sku))

      return inContent || inQuery
    })
  }

  // If still empty, return top context products to ensure SOMETHING shows if we found items.
  if (aiMentionedProducts.length === 0 && contextProducts.length > 0) {
    aiMentionedProducts = contextProducts.slice(0, 4)
  }

  return {
    content,
    products: aiMentionedProducts,
    nabData: contextNab,
    intel: contextIntel,
    should_show_whatsapp_button: showWhatsapp,
    confidence_level: confidence,
  }
}

export const generateExpertResponse = generateResponse

export async function getIntelligences() {
  const { data, error } = await supabase
    .from('market_intelligence')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function ingestManualKnowledge(payload: any) {
  const { data, error } = await supabase
    .from('market_intelligence')
    .insert([payload])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateIntelligenceSummary(id: string, summary: string) {
  const { error } = await supabase
    .from('market_intelligence')
    .update({ ai_summary: summary })
    .eq('id', id)

  if (error) throw error
  return true
}

export async function updateIntelligenceStatus(id: string, status: any) {
  let updateData: any = {}
  if (typeof status === 'object') {
    updateData = status
  } else if (typeof status === 'boolean') {
    updateData = { is_active: status }
  } else {
    updateData = { status: status }
  }

  const { error } = await supabase.from('market_intelligence').update(updateData).eq('id', id)

  if (error) throw error
  return true
}

export async function deleteIntelligence(id: string) {
  const { error } = await supabase.from('market_intelligence').delete().eq('id', id)

  if (error) throw error
  return true
}
