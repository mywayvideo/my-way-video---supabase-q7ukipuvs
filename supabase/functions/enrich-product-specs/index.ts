import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const bodyText = await req.text()
    let body: any = {}
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch (e) {
        // Ignore parse error
      }
    }

    const { product_id, product_name, product_description } = body

    if (!product_id || !product_name || !product_description) {
      return new Response(JSON.stringify({ error: 'Campos obrigatorios ausentes.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 3. Check Cache First
    try {
      const { data: cacheData } = await supabase
        .from('product_cache')
        .select('*')
        .eq('id', product_id)
        .maybeSingle()

      if (cacheData && cacheData.cached_at) {
        const cachedAt = new Date(cacheData.cached_at).getTime()
        const now = Date.now()
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

        if (now - cachedAt < sevenDaysMs) {
          const specs =
            typeof cacheData.product_specs === 'object' && cacheData.product_specs !== null
              ? cacheData.product_specs
              : { data: cacheData.product_specs }

          return new Response(
            JSON.stringify({
              data: {
                enriched_data: (specs as any).enriched_data || specs,
                ai_model_used: (specs as any)._ai_model_used || cacheData.source || 'cache',
                confidence_level: (specs as any)._confidence_level || 'high',
              },
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }
    } catch (e) {
      console.error('Error checking cache:', e)
    }

    // 4. Read Configuration
    let systemPrompt =
      'You are a senior expert in professional audiovisual products. Extract ALL detailed technical specifications from the product. Provide information a professional needs. Include compatibility, use cases, and related accessories.'
    let aiModelsOrder = ['deepseek', 'gpt-4o-mini', 'claude-3-5-sonnet']
    let aiModelsActive: Record<string, boolean> = {
      deepseek: true,
      'gpt-4o-mini': true,
      'claude-3-5-sonnet': true,
    }

    try {
      const { data: settings } = await supabase
        .from('ai_agent_settings')
        .select('*')
        .limit(1)
        .maybeSingle()

      if (settings) {
        if (settings.system_prompt) systemPrompt = settings.system_prompt
        if ((settings as any).ai_models_order) aiModelsOrder = (settings as any).ai_models_order
        if ((settings as any).ai_models_active) aiModelsActive = (settings as any).ai_models_active
      }
    } catch (e) {
      console.error('Error reading settings:', e)
    }

    // 5. AI Tier Fallback Logic
    let success = false
    let enrichedData = null
    let successfulModel = ''
    let finalConfidence = 'medium'

    const contextPrompt = `Product: ${product_name}\nDescription: ${product_description}`
    let activeTierIndex = 0

    for (let i = 0; i < aiModelsOrder.length; i++) {
      const modelName = aiModelsOrder[i]
      if (!aiModelsActive[modelName]) continue

      const timeoutMs = activeTierIndex === 0 ? 10000 : 5000
      activeTierIndex++

      if (activeTierIndex > 3) break // Max 3 tiers

      let providerType = ''
      let apiKey = ''
      let modelId = ''
      let customEndpoint = null

      if (modelName === 'deepseek') {
        providerType = 'deepseek'
        apiKey = Deno.env.get('DEEPSEEK_API_KEY') || ''
        modelId = 'deepseek-chat'
      } else if (modelName === 'gpt-4o-mini') {
        providerType = 'openai'
        apiKey = Deno.env.get('OPENAI_API_KEY') || ''
        modelId = 'gpt-4o-mini'
      } else if (modelName === 'claude-3-5-sonnet') {
        providerType = 'custom'
        apiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
        modelId = 'claude-3-5-sonnet-20240620'
        customEndpoint = 'https://api.anthropic.com/v1/messages'
      } else {
        providerType = 'openai'
        apiKey = Deno.env.get('OPENAI_API_KEY') || ''
        modelId = modelName
      }

      if (!apiKey) continue

      let attempt = 0
      const maxAttempts = 2 // 1 try + 1 retry

      while (attempt < maxAttempts && !success) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

          try {
            const responseText = await callAIProvider(
              providerType,
              customEndpoint,
              modelId,
              apiKey,
              systemPrompt,
              contextPrompt,
              controller.signal,
            )

            let parsedData = responseText
            try {
              const startBracket = responseText.indexOf('{')
              const endBracket = responseText.lastIndexOf('}')
              if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
                parsedData = JSON.parse(responseText.substring(startBracket, endBracket + 1))
              }
            } catch (e) {}

            enrichedData = parsedData
            successfulModel = modelName

            // 6. Confidence Level Assignment
            const lowerName = modelName.toLowerCase()
            if (lowerName.includes('deepseek')) finalConfidence = 'high'
            else if (lowerName.includes('gpt-4o-mini') || lowerName.includes('gpt4'))
              finalConfidence = 'medium'
            else if (lowerName.includes('claude') || lowerName.includes('sonnet'))
              finalConfidence = 'low'
            else finalConfidence = 'medium'

            success = true
          } finally {
            clearTimeout(timeoutId)
          }
        } catch (error: any) {
          const isNetworkError =
            error?.name === 'AbortError' ||
            error?.message?.toLowerCase().includes('fetch') ||
            error?.message?.toLowerCase().includes('network')
          attempt++
          if (isNetworkError && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 2000))
            continue
          } else {
            break
          }
        }
      }

      if (success) break
    }

    if (!success) {
      return new Response(
        JSON.stringify({ error: 'Nao foi possivel enriquecer dados do produto.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 7. Save to Cache
    try {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      const finalSpecs =
        typeof enrichedData === 'object' && enrichedData !== null
          ? { ...enrichedData, _confidence_level: finalConfidence, _ai_model_used: successfulModel }
          : {
              data: enrichedData,
              _confidence_level: finalConfidence,
              _ai_model_used: successfulModel,
            }

      const cachePayload: any = {
        id: product_id,
        product_name: product_name,
        product_specs: finalSpecs,
        source: successfulModel,
        cached_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        created_at: now.toISOString(),
      }

      await supabase.from('product_cache').upsert(cachePayload)
    } catch (e) {
      console.error('Error saving to cache:', e)
    }

    // 8. Return Response
    return new Response(
      JSON.stringify({
        data: {
          enriched_data: enrichedData,
          ai_model_used: successfulModel,
          confidence_level: finalConfidence,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ error: 'Erro ao processar solicitacao.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function callAIProvider(
  providerType: string,
  customEndpoint: string | null,
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  if (providerType === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal,
    })
    if (!res.ok) throw { status: res.status, message: await res.text() }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  if (providerType === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `System:\n${systemPrompt}\n\nUser:\n${userPrompt}` }] },
          ],
        }),
        signal,
      },
    )
    if (!res.ok) throw { status: res.status, message: await res.text() }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  if (providerType === 'deepseek') {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal,
    })
    if (!res.ok) throw { status: res.status, message: await res.text() }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  if (providerType === 'custom') {
    if (!customEndpoint) throw { status: 400, message: 'Custom endpoint missing' }

    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }

    let body: any = {
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }

    if (customEndpoint.includes('anthropic.com')) {
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }
      body = {
        model: modelId,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }
    }

    const res = await fetch(customEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw { status: res.status, message: await res.text() }
    const data = await res.json()

    if (customEndpoint.includes('anthropic.com')) {
      return data.content?.[0]?.text || ''
    }

    return data.choices?.[0]?.message?.content || data.response || ''
  }

  throw { status: 400, message: `Provedor não suportado.` }
}
