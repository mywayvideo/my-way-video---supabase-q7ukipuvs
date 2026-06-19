import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  const startTime = Date.now()
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    let authUser: any = null

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (authHeader) {
      const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const {
        data: { user },
        error: authError,
      } = await supabaseAuthClient.auth.getUser()
      if (!authError && user) {
        authUser = user
      }
    }

    let body
    try {
      body = await req.json()
    } catch (e) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Corpo da requisição inválido.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const query = body.query
    const sessionId = body.session_id || crypto.randomUUID()

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'A consulta (query) é obrigatória.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    let aiAgentSettings: any = null
    try {
      const { data: agentSet } = await supabaseAdmin
        .from('ai_agent_settings')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (agentSet) aiAgentSettings = agentSet
    } catch (e) {}

    let historyContext = ''
    try {
      const { data: historyData } = await supabaseAdmin
        .from('conversation_history')
        .select('query, response')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (historyData && historyData.length > 0) {
        historyContext =
          '\n\nHistórico Recente:\n' +
          historyData
            .reverse()
            .map((h: any) => `Cliente: ${h.query}\nAssistente: ${h.response}`)
            .join('\n\n')
      }
    } catch (e) {}

    const { data: providers, error: provError } = await supabaseAdmin
      .from('ai_providers')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true })

    if (provError || !providers || providers.length === 0) {
      return new Response(
        JSON.stringify({
          confidence_level: 'low',
          message:
            'Desculpe, não consegui processar sua pergunta agora. Tente novamente em alguns instantes ou entre em contato conosco.',
          should_show_whatsapp_button: true,
          referenced_internal_products: [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const defaultSystemPrompt = 'Consultor My Way Business. Responda de forma técnica e objetiva.'
    let dbSystemPrompt = aiAgentSettings?.system_prompt
    if (!dbSystemPrompt || dbSystemPrompt.trim() === '') {
      dbSystemPrompt = defaultSystemPrompt
    }

    let aiSettingsData: any = null
    try {
      const { data: setts } = await supabaseAdmin
        .from('ai_settings')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (setts) aiSettingsData = setts
    } catch (e) {}

    // KNOWLEDGE: Inject 'technical_bridge'
    let technicalBridgeRules = ''
    if (aiSettingsData?.technical_bridge) {
      try {
        const bridges =
          typeof aiSettingsData.technical_bridge === 'string'
            ? JSON.parse(aiSettingsData.technical_bridge)
            : aiSettingsData.technical_bridge
        if (Array.isArray(bridges) && bridges.length > 0) {
          technicalBridgeRules =
            '\n\nREGRAS DE PONTE TÉCNICA (Obrigatório):\n' +
            bridges
              .map(
                (b: any) =>
                  `- Se a fonte é ${b.source} e o destino é ${b.target}, você DEVE recomendar a solução: ${b.solution}`,
              )
              .join('\n')
        }
      } catch (e) {}
    }

    // TONE: Use 'proactivity_level'
    let tonePrompt = ''
    const proactivity = aiAgentSettings?.proactivity_level ?? 5
    if (proactivity >= 7) {
      tonePrompt =
        '\nESTILO DE RESPOSTA: Consultor Ativo. Sugira proativamente produtos relacionados, pontes técnicas e soluções completas.'
    } else if (proactivity <= 3) {
      tonePrompt =
        '\nESTILO DE RESPOSTA: Estritamente Reativo. Responda apenas o que foi perguntado, sem sugerir produtos adicionais.'
    }

    const formattingRules = `\n\nMANDATORY RULES:
- You are a Senior AV Expert. Use 'intent_mapping' and 'technical_bridge' as your primary guides.
- However, you MUST also use the full Inventory to find solutions.
- If a user asks for something not explicitly mapped (e.g., 'clipes musicais'), use your expertise to find matching products in the inventory.
- If multiple solutions exist (e.g., Teranex AND Optical Fiber 12G), you MUST list and explain ALL of them. Do not be lazy.
- Rule 1: If a user asks for a specific connection, check 'technical_bridge' first.
- Rule 2: If a product in a Technical Bridge rule is marked as 'is_discontinued: Yes', search the inventory for a newer model from the same manufacturer and recommend it as the current replacement.
1. The AI MUST respond in the EXACT same language used in the user's last message.
2. The AI is FORBIDDEN from comparing products unless the user explicitly asks for a comparison.
3. All technical specifications MUST be in code blocks with triple backticks.
4. Convert all database logic into natural, professional commercial sentences. Do NOT output database field names (e.g., price_usd, stock_count) or logical conditions.
5. Paragraphs: Maximum 2 sentences.
6. You are a Senior Technical Consultant. You are STRICTLY FORBIDDEN from discussing internal logic, JSON structures, metadata keys, or why a card is or isn't appearing. If a product is relevant, mention it naturally. Your internal engineering is invisible to the user.
7. You are STRICTLY FORBIDDEN from displaying a USD value with a 'R$' symbol.
8. Every price labeled as 'BRL' or 'Brasil' MUST be the result of the full conversion (Price * Exchange * Spread + Shipping).
9. Example: If a camera is $26,050, the BRL price MUST be approximately R$ 140.000,00 (depending on exchange), NEVER R$ 30.266,72.
10. Double-check your math before outputting text: BRL value must ALWAYS be significantly higher than USD value due to the exchange rate.
11. Se um produto não tiver preço cadastrado (0 ou nulo) tanto em USD quanto Nacionalizado, a disponibilidade é "Sob Consulta". NUNCA presuma que é estoque exclusivo do Brasil pela ausência de preço em USD.
12. É OBRIGATÓRIO incluir na chave "referenced_internal_products" TODOS os IDs (UUIDs) de todos os produtos que você mencionou no campo content.
${technicalBridgeRules}
${tonePrompt}

FORMATO OBRIGATÓRIO DE RESPOSTA (JSON):
{
  "content": "Sua resposta...",
  "referenced_internal_products": ["id_1", "id_2"]
}`

    const baseSystemPrompt = dbSystemPrompt + historyContext + formattingRules

    let success = false
    let responseText = ''
    let successfulProviderName = ''

    for (const provider of providers) {
      if (Date.now() - startTime > 30000) break

      const pType = provider.provider_type || provider.provider_name
      const apiKey = Deno.env.get(provider.api_key_secret_name)
      if (!apiKey && pType !== 'custom') continue

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        try {
          responseText = await callAIProvider(
            pType,
            provider.custom_endpoint,
            provider.model_id,
            apiKey || '',
            baseSystemPrompt,
            query.trim(),
            controller.signal,
          )
          success = true
          successfulProviderName = provider.provider_name
        } finally {
          clearTimeout(timeoutId)
        }
      } catch (error: any) {
        // Continue to next provider on failure to ensure neutral fallback
      }
      if (success) break
    }

    if (success) {
      let parsedResponse: any = { content: responseText, referenced_internal_products: [] }
      try {
        const start = responseText.indexOf('{')
        const end = responseText.lastIndexOf('}')
        if (start !== -1 && end !== -1) {
          parsedResponse = JSON.parse(responseText.substring(start, end + 1))
        } else {
          parsedResponse = JSON.parse(responseText)
        }
      } catch (e) {
        parsedResponse.content = responseText
      }

      const finalContent = parsedResponse.content || parsedResponse.message || responseText
      let finalConfidence = 'high'

      const normalizedForTrigger = finalContent
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (
        normalizedForTrigger.includes('suporte') ||
        normalizedForTrigger.includes('especialista') ||
        normalizedForTrigger.includes('equipe')
      ) {
        finalConfidence = 'low'
      }

      try {
        await supabaseAdmin.from('conversation_history').insert({
          user_id: authUser?.id || null,
          session_id: sessionId,
          query: query.trim(),
          response: finalContent,
        })
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        await supabaseAdmin.from('conversation_history').delete().lt('created_at', yesterday)
      } catch (e) {}

      let refs = parsedResponse.referenced_internal_products || []
      if (refs.length === 0 && Array.isArray(parsedResponse.products)) {
        refs = parsedResponse.products
          .map((p: any) => (typeof p === 'string' ? p : p.id))
          .filter(Boolean)
      }

      return new Response(
        JSON.stringify({
          status: 'success',
          provider_name: successfulProviderName,
          confidence_level: finalConfidence,
          response: finalContent,
          message: finalContent,
          query: query.trim(),
          session_id: sessionId,
          referenced_internal_products: refs,
          should_show_whatsapp_button: finalConfidence === 'low',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        confidence_level: 'low',
        message:
          'Desculpe, não consegui processar sua pergunta agora. Tente novamente em alguns instantes ou entre em contato conosco.',
        should_show_whatsapp_button: true,
        referenced_internal_products: [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        confidence_level: 'low',
        message: 'Desculpe, ocorreu um erro no sistema.',
        should_show_whatsapp_button: true,
        referenced_internal_products: [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
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
            {
              role: 'user',
              parts: [
                {
                  text: `Instruções de Sistema:\n${systemPrompt}\n\nConsulta do Usuário:\n${userPrompt}`,
                },
              ],
            },
          ],
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
        messages: [{ role: 'user', content: userPrompt + '\n\nReturn ONLY a JSON object.' }],
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

  throw new Error(`Provedor ${providerType} não suportado.`)
}
