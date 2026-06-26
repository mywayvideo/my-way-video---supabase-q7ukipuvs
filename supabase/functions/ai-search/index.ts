import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function safeJSONParse(str: string, fallback: any = null): any {
  try {
    return JSON.parse(str)
  } catch (e) {}

  let cleaned = str.trim()
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch (e) {}

  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(cleaned.slice(first, last + 1))
    } catch (e) {}
  }
  return fallback
}

function sanitizeInput(text: any): string {
  try {
    return JSON.stringify(String(text)).slice(1, -1)
  } catch {
    return ''
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body = null
    try {
      body = await req.json()
    } catch (e) {
      console.error('[ERRO] Body JSON inválido:', e)
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const query = sanitizeInput(body?.query || '')
    const userName = sanitizeInput(body?.userName || 'Cliente')
    const session_id = typeof body?.session_id === 'string' ? body.session_id : null
    const lastReferencedProductId = body?.currentProductId || null

    console.log(`[DEBUG] Entrada: User="${userName}", Query="${query}", Session="${session_id}", ProductID="${lastReferencedProductId}"`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    let history: any[] = []
    if (session_id) {
      const { data: histRows } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', session_id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (Array.isArray(histRows)) {
        history = histRows.reverse().map((row) => ({
          role: row.role,
          content: row.content,
        }))
      }
    }

    const [
      { data: agentSettings },
      { data: aiSettings },
      { data: globalSettings },
      { data: companyInfo },
    ] = await Promise.all([
      supabase.from('ai_agent_settings').select('*').maybeSingle(),
      supabase.from('ai_settings').select('*').maybeSingle(),
      supabase.from('settings').select('key, value'),
      supabase.from('company_info').select('content, type').maybeSingle(),
    ])

    const { data: manufacturers } = await supabase.from('manufacturers').select('name')
    const manufacturerList = manufacturers ? manufacturers.map((m) => m.name).join(', ') : ''

    const globalSettingsMap: Record<string, string> = {}
    if (Array.isArray(globalSettings)) {
      for (const s of globalSettings) {
        if (s?.key && s?.value) globalSettingsMap[s.key] = s.value
      }
    }

    let contextualProductData = null
    if (lastReferencedProductId) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name, sku, category, description, technical_info, image_url, manufacturer_id, manufacturers(name)')
        .eq('id', lastReferencedProductId)
        .maybeSingle()

      if (productError) {
        console.error('[ERRO] Falha ao buscar produto contextual:', productError)
      } else if (product) {
        let techInfo = product.technical_info
        try {
          if (techInfo) {
            techInfo = JSON.parse(techInfo)
          }
        } catch (e) {
          // Mantém como string caso não seja JSON válido
        }
        
        contextualProductData = {
          id: product.id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          description: product.description,
          technical_info: techInfo,
          image_url: product.image_url,
          manufacturer: (product.manufacturers as any)?.name || 'N/A'
        }
      }
    }

    const allowedProductIds = new Set<string>()
    if (contextualProductData) allowedProductIds.add(contextualProductData.id)

    const systemPrompt = `
    ### IDENTIDADE DO AGENTE
    ${agentSettings?.system_prompt || ''}

    ### PROMPT ESPECÍFICO DA PÁGINA DE PRODUTO (SE ATIVADO)
    ${lastReferencedProductId ? aiSettings?.product_page_prompt || '' : ''}

    ### CONTEXTO DA PÁGINA DE PRODUTO (ATIVAÇÃO)
    ${lastReferencedProductId ? 'Esta conversa ocorre na Página de Produto. O usuário está consultando especificamente este produto. Todas as respostas devem usar este produto como ponto de referência primário.\n\nREGRAS ABSOLUTAS PARA PÁGINA DE PRODUTO:\n1. Por padrão, sugira APENAS produtos complementares (acessórios, lentes, etc).\n2. PROIBIDO sugerir produtos da mesma categoria (ex: outras câmeras se estiver vendo uma câmera), A NÃO SER QUE o usuário solicite explicitamente uma comparação ou alternativas.\n3. Se o usuário pedir explicitamente para comparar ou ver opções similares, VOCÊ PODE e DEVE sugerir e referenciar produtos da mesma categoria.' : ''}

    ### TEMPLATE OPERACIONAL
    ${aiSettings?.system_prompt_template || ''}

    ### REGRAS DE LOGÍSTICA
    ${aiSettings?.logistics_rules_prompt || ''}

    ### CONTEXTO DA EMPRESA
    ${companyInfo?.content || ''}

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
    `

    const messages: any[] = [{ role: 'system', content: systemPrompt }]

    if (lastReferencedProductId && contextualProductData) {
      messages.push({
        role: 'system',
        content: 'CONTEXTUAL PRODUCT DATA (Structured JSON):\n' + JSON.stringify(contextualProductData, null, 2),
      })
    }

    if (history.length > 0) {
      messages.push(...history)
    }

    messages.push({ role: 'user', content: query })

    if (session_id) {
      await supabase.from('chat_messages').insert({ session_id, role: 'user', content: query })
    }

    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_products',
          description: 'Search the internal database for products based on keywords, categories, or specs.',
          parameters: {
            type: 'object',
            properties: {
              search_term: {
                type: 'string',
                description: 'The search term to query the database.',
              },
            },
            required: ['search_term'],
          },
        },
      },
    ]

    console.log('[DEBUG] Chamada OpenAI (Step 1: Check tools)...')
    const firstAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiSettings?.model_id || 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.1,
      }),
    })

    let finalContent = '{}'

    if (!firstAiResponse.ok) {
      console.error('[ERRO] OpenAI Error:', await firstAiResponse.text())
      return new Response(JSON.stringify({ error: 'Erro na API da IA' }), { headers: corsHeaders, status: 500 })
    }

    const firstData = await firstAiResponse.json()
    const responseMessage = firstData.choices?.[0]?.message

    if (responseMessage?.tool_calls) {
      console.log('[DEBUG] Tool Call Detectado:', responseMessage.tool_calls)
      messages.push(responseMessage)

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.function.name === 'search_products') {
          try {
            const args = JSON.parse(toolCall.function.arguments)
            console.log('[DEBUG] Buscando produtos por:', args.search_term)
            const { data: rpcResult } = await supabase.rpc('execute_ai_search_v3', {
              search_term: args.search_term,
            })
            const searchResults = Array.isArray((rpcResult as any)?.stock) ? (rpcResult as any).stock : []
            
            const baseInjectedProducts = searchResults.slice(0, 15).map((p: any) => {
              allowedProductIds.add(p.id)
              let techInfo = p.technical_info
              try {
                if (techInfo) techInfo = JSON.parse(techInfo)
              } catch (e) {}

              return {
                id: p.id,
                name: p.name,
                brand: p.manufacturers?.name || p.manufacturer_name || p.manufacturer || 'N/A',
                price_usd: p.price_usd,
                image_url: p.image_url,
                description: p.description,
                technical_info: techInfo
              }
            })

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: baseInjectedProducts.length > 0 
                ? JSON.stringify(baseInjectedProducts, null, 2)
                : 'Nenhum produto encontrado.',
            })
          } catch (e) {
            console.error('[ERRO] Tool Call falhou', e)
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: 'Erro interno ao buscar produtos.',
            })
          }
        }
      }

      console.log('[DEBUG] Chamada OpenAI (Step 2: JSON response)...')
      const secondAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiSettings?.model_id || 'gpt-4o-mini',
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      })
      
      const secondData = await secondAiResponse.json()
      finalContent = secondData.choices?.[0]?.message?.content || '{}'
    } else {
      finalContent = responseMessage?.content || '{}'
    }

    if (session_id) {
      await supabase.from('chat_messages').insert({ session_id, role: 'assistant', content: finalContent })
    }

    const result = safeJSONParse(finalContent, {
      message: globalSettingsMap['transparency_note'] || 'Desculpe, não consegui processar a resposta.',
      confidence_level: 'low',
      referenced_internal_products: [],
      should_show_whatsapp_button: true,
    })

    if (!Array.isArray(result.referenced_internal_products)) {
      result.referenced_internal_products = []
    }

    result.referenced_internal_products = result.referenced_internal_products.filter((id: string) => 
      allowedProductIds.has(id)
    )

    if (typeof result.message === 'string') {
      result.message = result.message.trim()
      if (lastReferencedProductId && globalSettingsMap['transparency_note']) {
        result.message += '\n\n' + globalSettingsMap['transparency_note']
      }
    }

    if (result.referenced_internal_products.length > 0) {
      const { data: groundedProducts } = await supabase
        .from('products')
        .select('id, name, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category, description, technical_info, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)')
        .in('id', result.referenced_internal_products)
      
      if (groundedProducts) {
        result.products = groundedProducts
          .map(p => ({
            ...p,
            manufacturer: (p.manufacturer as any)?.name || (p as any).manufacturer_name || 'N/A'
          }))
      }
    }

    console.log('[DEBUG] Retornando JSON final com ' + result.referenced_internal_products.length + ' produtos referenciados.')

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('[ERRO GLOBAL]', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
