import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

interface ChatMessage {
  role: string
  content: string
}

async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`AI API error: ${response.status} - ${errText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      max_tokens: 4000,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`AI API error: ${response.status} - ${errText}`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      query,
      session_id,
      currentProductId,
      currentProductContext,
      userName,
      messages = [],
    }: {
      query: string
      session_id?: string
      currentProductId?: string
      currentProductContext?: any
      userName?: string
      messages?: ChatMessage[]
    } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select(
        'system_prompt_template, product_page_prompt, logistics_rules_prompt, price_threshold_usd, result_component_config',
      )
      .limit(1)
      .maybeSingle()

    const { data: provider } = await supabase
      .from('ai_providers')
      .select('provider_name, model_id, api_key_secret_name, custom_endpoint, provider_type')
      .eq('is_active', true)
      .order('priority_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    const apiKeySecretName = provider?.api_key_secret_name || 'OPENAI_API_KEY'
    const apiKey = Deno.env.get(apiKeySecretName) || Deno.env.get('OPENAI_API_KEY') || ''

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          content: 'Erro: Nenhuma chave de API configurada.',
          products: [],
          referenced_internal_products: [],
          should_show_whatsapp_button: false,
          tier: 1,
          ai_referenced_products: [],
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    let systemPrompt =
      aiSettings?.system_prompt_template ||
      'You are a professional audiovisual equipment consultant for MY WAY Video. When mentioning a product from the catalog, include its ID using the format [PRODUCT:product-id].'

    try {
      const { data: searchResults } = await supabase.rpc('search_products_v2', {
        search_term: query,
        boost_multiplier: 1.0,
      })

      if (searchResults && searchResults.length > 0) {
        const topProducts = searchResults.slice(0, 10)
        systemPrompt +=
          '\n\nAvailable products from our catalog:\n' +
          topProducts
            .map(
              (p: any) =>
                `[PRODUCT:${p.id}] ${p.name} - USD $${p.price_usd || 'N/A'} - ${p.category || 'N/A'} - ${(p.description || 'No description').substring(0, 200)}${p.image_url ? ` - Image: ${p.image_url}` : ''}`,
            )
            .join('\n')
      }
    } catch (_e) {
      // Continue without search results
    }

    const isProductPage = !!currentProductId
    let originProductName = 'this product'
    let originProductPrice = 0

    if (isProductPage) {
      let productCtx: any = currentProductContext || {}

      if (!productCtx.id && currentProductId) {
        const { data: productData } = await supabase
          .from('products')
          .select(
            'id, name, sku, description, technical_info, price_usd, image_url, category, manufacturer:manufacturers(name)',
          )
          .eq('id', currentProductId)
          .maybeSingle()

        if (productData) {
          productCtx = productData
        }
      }

      originProductName = productCtx.name || 'this product'
      originProductPrice = productCtx.price_usd || 0

      if (aiSettings?.product_page_prompt) {
        systemPrompt += '\n\n' + aiSettings.product_page_prompt
      }

      systemPrompt += `\n\nThe user is viewing product "${originProductName}". Questions without naming another product refer to this product.`

      systemPrompt +=
        '\n\nYour answer will be REJECTED if it does not include the image of every product mentioned. Use markdown image syntax: ![Product Name](image_url) for each product you mention.'

      const manufacturerName =
        typeof productCtx.manufacturer === 'object'
          ? productCtx.manufacturer?.name
          : productCtx.manufacturer

      systemPrompt +=
        `\n\nCurrent product details:\n` +
        `- ID: ${productCtx.id || currentProductId}\n` +
        `- Name: ${productCtx.name || 'N/A'}\n` +
        `- SKU: ${productCtx.sku || 'N/A'}\n` +
        `- Category: ${productCtx.category || 'N/A'}\n` +
        `- Description: ${productCtx.description || 'N/A'}\n` +
        `- Technical Info: ${productCtx.technical_info || 'N/A'}\n` +
        `- Price USD: ${productCtx.price_usd || 'N/A'}\n` +
        `- Image URL: ${productCtx.image_url || 'N/A'}\n` +
        `- Manufacturer: ${manufacturerName || 'N/A'}`
    }

    if (aiSettings?.logistics_rules_prompt) {
      systemPrompt += '\n\n' + aiSettings.logistics_rules_prompt
    }

    const aiMessages: ChatMessage[] = []
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        aiMessages.push({ role: msg.role, content: msg.content })
      }
    }
    aiMessages.push({
      role: 'user',
      content: userName ? `${userName} asks: ${query}` : query,
    })

    const providerName = (provider?.provider_name || 'openai').toLowerCase()
    const modelId = provider?.model_id || 'gpt-4o-mini'
    const baseUrl =
      provider?.custom_endpoint ||
      (providerName === 'deepseek'
        ? 'https://api.deepseek.com'
        : providerName === 'anthropic'
          ? 'https://api.anthropic.com'
          : 'https://api.openai.com')

    let aiResponse: string
    if (providerName === 'anthropic') {
      aiResponse = await callAnthropic(baseUrl, apiKey, modelId, systemPrompt, aiMessages)
    } else {
      aiResponse = await callOpenAI(baseUrl, apiKey, modelId, systemPrompt, aiMessages)
    }

    const productRefs: string[] = []
    const refRegex = /\[PRODUCT:([0-9a-fA-F-]{36})\]/g
    let match: RegExpExecArray | null
    while ((match = refRegex.exec(aiResponse)) !== null) {
      productRefs.push(match[1])
    }

    const filteredRefs = currentProductId
      ? productRefs.filter((id) => id !== currentProductId)
      : productRefs

    let products: any[] = []
    if (filteredRefs.length > 0) {
      const { data: productData } = await supabase
        .from('products')
        .select(
          'id, name, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category, description, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)',
        )
        .in('id', filteredRefs)

      if (productData) {
        products = productData.map((p: any) => ({
          ...p,
          manufacturer: p.manufacturer?.name || p.manufacturer,
        }))
      }
    }

    const confidenceLevel = filteredRefs.length > 0 ? 'high' : 'low'
    const priceThreshold = aiSettings?.price_threshold_usd || 5000
    const shouldShowWhatsapp =
      isProductPage &&
      (originProductPrice > priceThreshold ||
        products.some((p) => (p.price_usd || 0) > priceThreshold))

    const cleanedContent = aiResponse.replace(/\[PRODUCT:[0-9a-fA-F-]{36}\]/g, '').trim()

    if (session_id) {
      try {
        await supabase.from('conversation_history').insert({
          id: crypto.randomUUID(),
          session_id,
          user_id: null,
          query,
          response: cleanedContent,
        })
      } catch (_e) {
        // Ignore
      }
    }

    const { data: whatsappSetting } = await supabase
      .from('app_settings')
      .select('setting_value')
      .in('setting_key', ['whatsapp_number', 'company_whatsapp'])
      .limit(1)

    const companyWhatsapp = whatsappSetting?.[0]?.setting_value || '17867161170'

    return new Response(
      JSON.stringify({
        content: cleanedContent,
        products,
        referenced_internal_products: filteredRefs,
        should_show_whatsapp_button: shouldShowWhatsapp,
        tier: 1,
        ai_referenced_products: filteredRefs,
        confidence_level: confidenceLevel,
        settings: {
          company_whatsapp: companyWhatsapp,
          result_component_config: aiSettings?.result_component_config || {},
        },
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        content: 'Desculpe, ocorreu um erro ao processar sua solicitação.',
        products: [],
        referenced_internal_products: [],
        should_show_whatsapp_button: false,
        tier: 1,
        ai_referenced_products: [],
        error: error.message,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
})
