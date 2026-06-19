import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { url, raw_content, manufacturer_id, record_id, title } = body

    if (!url && !raw_content) {
      return new Response(JSON.stringify({ error: 'URL or text content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    let contentToProcess = raw_content || ''

    if (url) {
      try {
        const htmlRes = await fetch(url)
        if (htmlRes.ok) {
          const htmlText = await htmlRes.text()
          contentToProcess += '\n' + htmlText
        }
      } catch (e) {
        console.error('Fetch URL error', e)
      }
    }

    // Truncate content to avoid token limits
    const truncatedContent = contentToProcess.substring(0, 15000)

    const { data: providers } = await supabase
      .from('ai_providers')
      .select('*')
      .eq('is_active', true)
      .order('priority_order', { ascending: true })

    let aiTitle = ''
    let aiSummary = ''
    let aiSpecs = ''
    let success = false
    let usedProvider = ''

    if (providers && providers.length > 0) {
      const systemPrompt = `Você é um especialista em tecnologia audiovisual analisando novidades e informações de mercado.
Extract the following information from the provided text/HTML:
1. A suitable Title for the content.
2. Technical Specifications (in Markdown format).
3. A 3-paragraph Summary in Portuguese (PT-BR) about the announcement/product.

Return ONLY a valid JSON in this format:
{
  "title": "...",
  "specs": "...",
  "summary": "..."
}`

      for (const provider of providers) {
        const apiKey = Deno.env.get(provider.api_key_secret_name)
        if (!apiKey) continue

        const pType = provider.provider_type || provider.provider_name
        const modelId = provider.model_id
        const customEndpoint = provider.custom_endpoint

        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 20000)

          let responseText = ''

          try {
            responseText = await callAIProvider(
              pType,
              customEndpoint,
              modelId,
              apiKey,
              systemPrompt,
              truncatedContent,
              controller.signal,
            )
          } finally {
            clearTimeout(timeoutId)
          }

          let parsed: any = {}
          try {
            const startBracket = responseText.indexOf('{')
            const endBracket = responseText.lastIndexOf('}')
            if (startBracket !== -1 && endBracket !== -1) {
              parsed = JSON.parse(responseText.substring(startBracket, endBracket + 1))
            } else {
              parsed = JSON.parse(responseText)
            }
          } catch (e) {
            console.error('JSON parse error:', e)
            throw new Error('Invalid JSON')
          }

          if (parsed.title) aiTitle = parsed.title
          if (parsed.specs) aiSpecs = parsed.specs
          if (parsed.summary) aiSummary = parsed.summary

          success = true
          usedProvider = provider.provider_name
          break
        } catch (e) {
          console.error(`Provider ${provider.provider_name} failed:`, e)
        }
      }
    }

    if (!success) {
      console.error('All AI providers failed.')
    }

    const combinedContent = `**Especificações Técnicas:**\n${aiSpecs || 'Não extraído.'}\n\n**Resumo:**\n${aiSummary || 'Não extraído.'}`

    let targetRecordId = record_id

    if (!targetRecordId && url) {
      // Find existing record by url
      const { data: existing } = await supabase
        .from('market_intelligence')
        .select('id')
        .eq('source_url', url)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing) {
        targetRecordId = existing.id
      }
    }

    if (targetRecordId) {
      const { data, error } = await supabase
        .from('market_intelligence')
        .update({
          title: title || aiTitle || 'Processado Automaticamente',
          ai_summary: combinedContent,
          raw_content: truncatedContent,
          status: 'published',
        })
        .eq('id', targetRecordId)
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify({ success: true, data, provider: usedProvider }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      // Insert new if not found
      const { data, error } = await supabase
        .from('market_intelligence')
        .insert({
          title: title || aiTitle || 'Processado Automaticamente',
          source_url: url || null,
          manufacturer_id: manufacturer_id || null,
          ai_summary: combinedContent,
          raw_content: truncatedContent,
          status: 'published',
        })
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify({ success: true, data, provider: usedProvider }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
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
        response_format: { type: 'json_object' },
      }),
      signal,
    })
    if (!res.ok) throw new Error(await res.text())
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
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal,
      },
    )
    if (!res.ok) throw new Error(await res.text())
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
        response_format: { type: 'json_object' },
      }),
      signal,
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  if (providerType === 'custom') {
    if (!customEndpoint) throw new Error('Custom endpoint missing')

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
      response_format: { type: 'json_object' },
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
        messages: [{ role: 'user', content: userPrompt + '\n\nReturn ONLY JSON.' }],
      }
    }

    const res = await fetch(customEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()

    if (customEndpoint.includes('anthropic.com')) {
      return data.content?.[0]?.text || ''
    }

    return data.choices?.[0]?.message?.content || data.response || ''
  }

  throw new Error(`Provedor não suportado.`)
}
