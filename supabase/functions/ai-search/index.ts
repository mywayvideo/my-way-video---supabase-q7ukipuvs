import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

function safeJSONParse(str: string, fallback: any = null): any {
  try { return JSON.parse(str) } catch {}
  let cleaned = str.trim().replace(/```json/gi, '').replace(/```/g, '').trim()
  try { return JSON.parse(cleaned) } catch {}
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)) } catch {}
  }
  return fallback
}

function sanitizeInput(text: any): string {
  try { return JSON.stringify(String(text)).slice(1, -1) } catch { return '' }
}

const INSTITUTIONAL_KEYWORDS = [
  'horario', 'horário', 'hora', 'hours', 'abre', 'fecha', 'funcionamento', 'expediente',
  'open', 'close', 'atendimento', 'sobre', 'about', 'empresa', 'company', 'quem',
  'história', 'history', 'missão', 'visão', 'valores', 'quem somos',
  'endereço', 'address', 'localização', 'location', 'onde', 'rua', 'cep',
  'telefone', 'phone', 'contato', 'contact', 'email', 'e-mail',
  'whatsapp', 'wpp', 'política', 'policy', 'termos', 'terms',
  'reembolso', 'refund', 'troca', 'return', 'privacidade', 'privacy',
  'entrega', 'shipping', 'frete', 'delivery', 'prazo', 'envio',
  'pagamento', 'payment', 'cartão', 'card', 'pix', 'boleto',
  'transferência', 'stripe', 'paypal', 'garantia', 'warranty',
  'ajuda', 'help', 'suporte', 'support', 'dúvida', 'duvida',
  'cnpj', 'cpf', 'olá', 'ola', 'oi', 'bom dia', 'boa tarde', 'boa noite',
  'obrigado', 'obrigada'
]

function isInstitutionalQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return INSTITUTIONAL_KEYWORDS.some((kw) => lower.includes(kw))
}

function checkKeywordRelevance(
  query: string,
  keywords: Array<{ keyword: string; weight: number; is_blocking: boolean }>
): { isBlocked: boolean; relevanceScore: number } {
  const lower = query.toLowerCase()
  let isBlocked = false
  let relevanceScore = 0
  for (const kw of keywords) {
    if (lower.includes(kw.keyword.toLowerCase())) {
      if (kw.is_blocking) isBlocked = true
      relevanceScore += kw.weight || 1.0
    }
  }
  return { isBlocked, relevanceScore }
}

function extractProducts(rpcResult: any): any[] {
  if (!rpcResult) return []
  if (Array.isArray(rpcResult)) return rpcResult
  if (Array.isArray(rpcResult?.stock)) return rpcResult.stock
  if (Array.isArray(rpcResult?.products)) return rpcResult.products
  const arrays = Object.values(rpcResult).filter(Array.isArray)
  if (arrays.length > 0) return arrays[0] as any[]
  return []
}

function buildProductContext(products: any[]): any[] {
  return products.slice(0, 15).map((p: any) => {
    let techInfo = p.technical_info
    try { if (techInfo) techInfo = JSON.parse(techInfo) } catch {}
    return {
      id: p.id, name: p.name, sku: p.sku,
      brand: p.manufacturers?.name || p.manufacturer_name || p.manufacturer || 'N/A',
      price_usd: p.price_usd, image_url: p.image_url,
      description: p.description, technical_info: techInfo,
    }
  })
}

function mergeProductResults(resultArrays: any[][]): any[] {
  const productMap = new Map<string, any>()
  for (const products of resultArrays) {
    for (const p of products) {
      if (p?.id && !productMap.has(p.id)) productMap.set(p.id, p)
    }
  }
  return Array.from(productMap.values())
}

const OUT_OF_SCOPE_MESSAGE = 'Desculpe, só posso responder perguntas relacionadas com o nosso catálogo de produtos e serviços.'

async function extractEntities(query: string, openaiKey: string): Promise<string[]> {
  const extractionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a product entity extractor for a professional audiovisual equipment store. Given a user query, extract individual product names, models, brands, or technical terms that should be searched separately in the product database. Return a JSON object with an "entities" array. Each entity should be a concise search term (2-5 words max). If the query mentions multiple products for comparison, extract each one separately. If the query is institutional (hours, location, shipping, payment, etc.) and not about specific products, return an empty array. Examples: "Sony FX6 vs Blackmagic Pyxis 6K" -> {"entities": ["Sony FX6", "Blackmagic Pyxis 6K"]}; "preço da câmera FX3" -> {"entities": ["FX3"]}; "qual o horário de funcionamento" -> {"entities": []}; "lente 50mm e 85mm da Sony" -> {"entities": ["Sony 50mm lens", "Sony 85mm lens"]}.',
        },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 200,
    }),
  })

  if (!extractionResponse.ok) {
    console.error('[ERRO] Entity extraction failed:', await extractionResponse.text())
    return [query]
  }

  const extractionData = await extractionResponse.json()
  const extractionContent = extractionData.choices?.[0]?.message?.content || '{}'
  const parsed = safeJSONParse(extractionContent, { entities: [] })
  const entities = Array.isArray(parsed?.entities) ? parsed.entities : []

  if (entities.length === 0) return [query]
  return entities.filter((e: any) => typeof e === 'string' && e.trim().length > 0)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body: any = null
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      })
    }

    const query = sanitizeInput(body?.query || '')
    const userName = sanitizeInput(body?.userName || 'Cliente')
    const session_id = typeof body?.session_id === 'string' ? body.session_id : null
    const lastReferencedProductId = body?.currentProductId || null
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''

    console.log(`[DEBUG] User="${userName}", Query="${query}", Session="${session_id}", ProductID="${lastReferencedProductId}"`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    let history: any[] = []
    if (session_id) {
      const { data: histRows } = await supabase
        .from('chat_messages').select('role, content')
        .eq('session_id', session_id)
        .order('created_at', { ascending: false }).limit(10)
      if (Array.isArray(histRows)) {
        history = histRows.reverse().map((row) => ({ role: row.role, content: row.content }))
      }
    }

    const [
      { data: agentSettings },
      { data: aiSettings },
      { data: globalSettings },
      { data: companyInfoRows },
      { data: avproKeywords },
    ] = await Promise.all([
      supabase.from('ai_agent_settings').select('*').maybeSingle(),
      supabase.from('ai_settings').select('*').maybeSingle(),
      supabase.from('settings').select('key, value'),
      supabase.from('company_info').select('content, type'),
      supabase.from('avpro_keywords').select('keyword, weight, is_blocking'),
    ])

    const { data: manufacturers } = await supabase.from('manufacturers').select('name')
    const manufacturerList = manufacturers ? manufacturers.map((m) => m.name).join(', ') : ''

    const globalSettingsMap: Record<string, string> = {}
    if (Array.isArray(globalSettings)) {
      for (const s of globalSettings) {
        if (s?.key && s?.value) globalSettingsMap[s.key] = s.value
      }
    }

    const institutionalContext = Array.isArray(companyInfoRows) && companyInfoRows.length > 0
      ? companyInfoRows
          .filter((row: any) => row.type === 'ai_knowledge' || row.type === 'footer_about')
          .map((row: any) => `[${row.type || 'info'}] ${row.content || ''}`).join('\n')
      : (companyInfoRows as any)?.content || ''

    const keywordList = Array.isArray(avproKeywords) ? avproKeywords : []
    const allowedProductIds = new Set<string>()

    // === ENTITY EXTRACTION STEP ===
    let searchEntities: string[] = [query]
    if (query && query.trim().length > 0) {
      console.log('[DEBUG] Extracting entities from query...')
      searchEntities = await extractEntities(query, openaiKey)
      console.log(`[DEBUG] Extracted entities: ${JSON.stringify(searchEntities)}`)
    }

    // === PARALLEL MULTI-PRODUCT SEARCH ===
    let level1Products: any[] = []
    if (query && query.trim().length > 0) {
      const searchPromises = searchEntities.map((term) =>
        supabase.rpc('execute_ai_search_v3', { search_term: term })
      )
      const searchResults = await Promise.all(searchPromises)
      const productArrays = searchResults.map((r) => extractProducts(r.data))
      level1Products = mergeProductResults(productArrays)
      console.log(`[DEBUG] Parallel search: ${searchEntities.length} entities, ${level1Products.length} unique products after merge`)
    }

    // === KEYWORD VALIDATION (only if no products found) ===
    let keywordRelevant = false
    let isBlocked = false
    if (level1Products.length === 0 && query.trim().length > 0) {
      const kwCheck = checkKeywordRelevance(query, keywordList)
      isBlocked = kwCheck.isBlocked
      keywordRelevant = kwCheck.relevanceScore > 0
      console.log(`[DEBUG] Keywords: blocked=${isBlocked}, relevant=${keywordRelevant}`)
    }

    // === INSTITUTIONAL KNOWLEDGE ===
    const isInst = query.trim().length > 0 ? isInstitutionalQuery(query) : false
    console.log(`[DEBUG] Institutional: ${isInst}`)

    // === OUT-OF-SCOPE REFUSAL (only if no products AND not institutional/keyword) ===
    const hasProductContext = level1Products.length > 0
    const hasKeywordOrInstitutional = (keywordRelevant || isInst) && !isBlocked

    if (!hasProductContext && !hasKeywordOrInstitutional) {
      console.log('[DEBUG] Out of scope refusal')
      const outOfScopeResult = {
        message: OUT_OF_SCOPE_MESSAGE,
        confidence_level: 'high',
        referenced_internal_products: [],
        should_show_whatsapp_button: false,
      }
      if (session_id) {
        await supabase.from('chat_messages').insert([
          { session_id, role: 'user', message: query, content: query },
          { session_id, role: 'assistant', message: OUT_OF_SCOPE_MESSAGE, content: JSON.stringify(outOfScopeResult) },
        ])
      }
      return new Response(JSON.stringify(outOfScopeResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // Fetch contextual product if on a product page
    let contextualProductData = null
    if (lastReferencedProductId) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name, sku, category, description, technical_info, image_url, manufacturer_id, manufacturers(name), price_usd, price_brl, price_cost, price_cost_rebate, price_nationalized_cost, price_nationalized_sales, price_usa_rebate')
        .eq('id', lastReferencedProductId).maybeSingle()
      if (productError) {
        console.error('[ERRO] Contextual product fetch:', productError)
      } else if (product) {
        let techInfo = product.technical_info
        try { if (techInfo) techInfo = JSON.parse(techInfo) } catch {}
        contextualProductData = {
          id: product.id, name: product.name, sku: product.sku, category: product.category,
          description: product.description, technical_info: techInfo, image_url: product.image_url,
          manufacturer: (product.manufacturers as any)?.name || 'N/A',
          price_usd: product.price_usd, price_brl: product.price_brl,
          price_cost: product.price_cost, price_cost_rebate: product.price_cost_rebate,
          price_nationalized_cost: product.price_nationalized_cost,
          price_nationalized_sales: product.price_nationalized_sales,
          price_usa_rebate: product.price_usa_rebate,
        }
        allowedProductIds.add(contextualProductData.id)
      }
    }

    if (hasProductContext) {
      const level1Context = buildProductContext(level1Products)
      for (const p of level1Context) allowedProductIds.add(p.id)
    }

    const systemPrompt = `
### IDENTIDADE DO AGENTE
${agentSettings?.system_prompt || ''}

### PROMPT ESPECÍFICO DA PÁGINA DE PRODUTO (SE ATIVADO)
${lastReferencedProductId ? aiSettings?.product_page_prompt || '' : ''}

### CONTEXTO DA PÁGINA DE PRODUTO (ATIVAÇÃO)
${lastReferencedProductId ? 'Esta conversa ocorre na Página de Produto. O usuário está consultando especificamente este produto. Todas as respostas devem usar este produto como ponto de referência primário.\n\nREGRAS ABSOLUTAS PARA PÁGINA DE PRODUTO:\n1. Por padrão, sugira APENAS produtos complementares (acessórios, lentes, etc).\n2. PROIBIDO sugerir produtos da mesma categoria (ex: outras câmeras se estiver vendo uma câmera), A NÃO SER QUE o usuário solicite explicitamente uma comparação ou alternativas.\n3. Se o usuário pedir explicitamente para comparar ou ver opções similares, VOCÊ PODE e DEVE sugerir e referenciar produtos da mesma categoria.' : ''}

### CONTEXTO INSTITUCIONAL
${institutionalContext}

### TEMPLATE OPERACIONAL
${aiSettings?.system_prompt_template || ''}

### REGRAS DE LOGÍSTICA
${aiSettings?.logistics_rules_prompt || ''}

### FABRICANTES DISPONÍVEIS
${manufacturerList}

### REGRAS DE OURO (FORMATO FINAL DO JSON)
1. A resposta FINAL deve ser apenas JSON, no formato exato:
{
  "message": "...",
  "confidence_level": "high" | "low",
  "referenced_internal_products": [],
  "should_show_whatsapp_button": boolean
}
2. Nunca escrever nada fora do JSON.
3. "referenced_internal_products" deve conter APENAS os IDs dos produtos retornados pela ferramenta search_products ou os produtos do contexto atual.
4. IDs nunca devem aparecer no texto visível ao usuário.
5. Formate o texto da message em markdown. É OBRIGATÓRIO inserir as imagens dos produtos sempre que recomendá-los ou detalhá-los, usando o formato ![Nome do Produto](image_url). Use APENAS as URLs fornecidas no JSON estruturado.
6. Se o usuário fizer perguntas institucionais (horários, informações da empresa, formas de pagamento, entrega, etc.), responda usando o CONTEXTO INSTITUCIONAL fornecido acima. Nesses casos, "referenced_internal_products" deve ser um array vazio e "should_show_whatsapp_button" deve ser true.
`

    const messages: any[] = [{ role: 'system', content: systemPrompt }]

    if (lastReferencedProductId && contextualProductData) {
      messages.push({
        role: 'system',
        content: 'CONTEXTUAL PRODUCT DATA (Structured JSON):\n' + JSON.stringify(contextualProductData, null, 2),
      })
    }

    if (hasProductContext) {
      const level1Context = buildProductContext(level1Products)
      messages.push({
        role: 'system',
        content: 'INITIAL PRODUCT SEARCH RESULTS (Structured JSON):\n' + JSON.stringify(level1Context, null, 2),
      })
    }

    if (history.length > 0) messages.push(...history)
    messages.push({ role: 'user', content: query })

    if (session_id) {
      await supabase.from('chat_messages').insert({ session_id, role: 'user', message: query, content: query })
    }

    const tools = [{
      type: 'function',
      function: {
        name: 'search_products',
        description: 'Search the internal database for products based on keywords, categories, SKUs, or specs.',
        parameters: {
          type: 'object',
          properties: { search_term: { type: 'string', description: 'The search term to query the database.' } },
          required: ['search_term'],
        },
      },
    }]

    console.log('[DEBUG] Calling OpenAI (with response_format json_object)...')
    const firstAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiSettings?.model_id || 'gpt-4o-mini',
        messages, tools, tool_choice: 'auto', temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    })

    let finalContent = '{}'

    if (!firstAiResponse.ok) {
      console.error('[ERRO] OpenAI Error:', await firstAiResponse.text())
      return new Response(JSON.stringify({ error: 'Erro na API da IA' }), {
        headers: corsHeaders, status: 500,
      })
    }

    const firstData = await firstAiResponse.json()
    const responseMessage = firstData.choices?.[0]?.message

    if (responseMessage?.tool_calls) {
      console.log('[DEBUG] Tool Call detected:', responseMessage.tool_calls)
      messages.push(responseMessage)

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.function.name === 'search_products') {
          try {
            const args = JSON.parse(toolCall.function.arguments)
            console.log('[DEBUG] Searching products for:', args.search_term)
            const { data: rpcResult } = await supabase.rpc('execute_ai_search_v3', { search_term: args.search_term })
            const searchResults = extractProducts(rpcResult)
            const injectedProducts = buildProductContext(searchResults)
            for (const p of injectedProducts) allowedProductIds.add(p.id)

            messages.push({
              role: 'tool', tool_call_id: toolCall.id, name: toolCall.function.name,
              content: injectedProducts.length > 0 ? JSON.stringify(injectedProducts, null, 2) : 'Nenhum produto encontrado.',
            })
          } catch (e) {
            console.error('[ERRO] Tool Call failed', e)
            messages.push({
              role: 'tool', tool_call_id: toolCall.id, name: toolCall.function.name,
              content: 'Erro interno ao buscar produtos.',
            })
          }
        }
      }

      console.log('[DEBUG] Calling OpenAI (Step 2: JSON response)...')
      const secondAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiSettings?.model_id || 'gpt-4o-mini',
          messages, response_format: { type: 'json_object' }, temperature: 0.1,
        }),
      })
      const secondData = await secondAiResponse.json()
      finalContent = secondData.choices?.[0]?.message?.content || '{}'
    } else {
      finalContent = responseMessage?.content || '{}'
    }

    if (session_id) {
      await supabase.from('chat_messages').insert({ session_id, role: 'assistant', message: finalContent, content: finalContent })
    }

    const result = safeJSONParse(finalContent, {
      message: 'Desculpe, não consegui processar a resposta.',
      confidence_level: 'low',
      referenced_internal_products: [],
      should_show_whatsapp_button: true,
    })

    if (!Array.isArray(result.referenced_internal_products)) {
      result.referenced_internal_products = []
    }

    result.referenced_internal_products = result.referenced_internal_products.filter((id: string) => allowedProductIds.has(id))

    if (typeof result.message === 'string') {
      result.message = result.message.trim()
      if (lastReferencedProductId && globalSettingsMap['transparency_note'] && result.referenced_internal_products.length > 0) {
        result.message += '\n\n' + globalSettingsMap['transparency_note']
      }
    }

    if (result.referenced_internal_products.length > 0) {
      const { data: groundedProducts } = await supabase
        .from('products')
        .select('id, name, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category, description, technical_info, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)')
        .in('id', result.referenced_internal_products)
      if (groundedProducts) {
        result.products = groundedProducts.map((p: any) => ({
          ...p, manufacturer: (p.manufacturer as any)?.name || (p as any).manufacturer_name || 'N/A',
        }))
      }
    }

    console.log('[DEBUG] Returning JSON with ' + result.referenced_internal_products.length + ' referenced products.')

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (error: any) {
    console.error('[ERRO GLOBAL]', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    })
  }
})
