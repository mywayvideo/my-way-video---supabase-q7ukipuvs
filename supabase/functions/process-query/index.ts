import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      query,
      products = [],
      intelligence = [],
      agentId,
      isNABQuery,
      assembledPrompt,
      temperature = 0.1,
    } = await req.json()

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const { data: aiAgentSettings } = await supabase
      .from('ai_agent_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let systemPrompt = aiAgentSettings?.system_prompt || ''
    let systemPromptTemplate = aiSettings?.system_prompt_template || ''
    const logisticsRulesPrompt =
      (aiSettings?.logistics_rules_prompt || '') +
      '\nIMPORTANTE: Se o produto não tiver preço cadastrado (0 ou nulo) tanto em USD quanto Nacionalizado, a disponibilidade é "Sob Consulta" e NUNCA presuma que é estoque nacional ou Brasil apenas pela ausência de preço em USD.'

    if (!systemPrompt.trim() && !systemPromptTemplate.trim()) {
      systemPrompt = 'Consultor My Way Business. Responda de forma técnica e objetiva.'
    }

    // KNOWLEDGE: Inject 'technical_bridge' (Section I)
    let technicalBridgeRules = ''
    if (aiSettings?.technical_bridge) {
      try {
        const bridges =
          typeof aiSettings.technical_bridge === 'string'
            ? JSON.parse(aiSettings.technical_bridge)
            : aiSettings.technical_bridge
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

    // TONE: Use 'proactivity_level' (Section J)
    let tonePrompt = ''
    const proactivity = aiAgentSettings?.proactivity_level ?? 5
    if (proactivity >= 7) {
      tonePrompt =
        '\nESTILO DE RESPOSTA: Consultor Ativo. Sugira proativamente produtos relacionados, pontes técnicas e soluções completas.'
    } else if (proactivity <= 3) {
      tonePrompt =
        '\nESTILO DE RESPOSTA: Estritamente Reativo. Responda apenas o que foi perguntado, sem sugerir produtos adicionais.'
    }

    let agent = null
    if (agentId) {
      const { data } = await supabase.from('ai_providers').select('*').eq('id', agentId).single()
      agent = data
    } else {
      const { data } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('is_active', true)
        .order('priority_order', { ascending: true })
        .limit(1)
        .single()
      agent = data
    }

    if (!agent) {
      return new Response(JSON.stringify({ message: 'Nenhum agente de IA configurado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const hasIntelData = intelligence && intelligence.length > 0

    const dynamicConstraints = `
MANDATORY RULES:
- You are a Senior AV Expert. Use 'intent_mapping' and 'technical_bridge' as your primary guides.
- However, you MUST also use the full Inventory to find solutions.
- If a user asks for something not explicitly mapped (e.g., 'clipes musicais'), use your expertise to find matching products in the inventory.
- If multiple solutions exist (e.g., Teranex AND Optical Fiber 12G), you MUST list and explain ALL of them. Do not be lazy.
- Rule 1: If a user asks for a specific connection, check 'technical_bridge' first.
- Rule 2: If a product in a Technical Bridge rule is marked as 'is_discontinued: Yes', search the inventory for a newer model from the same manufacturer and recommend it as the current replacement.
- The AI MUST respond in the EXACT same language used in the user's last message (Portuguese PT-BR).
- The AI is FORBIDDEN from comparing products unless the user explicitly asks for a comparison.
- All technical specifications MUST be in code blocks with triple backticks.
- You MUST return the exact IDs of ALL referenced products in the "referenced_internal_products" array. This is critical for the UI to display the product cards.
- You are a Senior Technical Consultant. You are STRICTLY FORBIDDEN from discussing internal logic, JSON structures, metadata keys, or why a card is or isn't appearing. If a product is relevant, mention it naturally. Your internal engineering is invisible to the user.
- You are STRICTLY FORBIDDEN from displaying a USD value with a 'R$' symbol.
- Every price labeled as 'BRL' or 'Brasil' MUST be the result of the full conversion (Price * Exchange * Spread + Shipping).
- Example: If a camera is $26,050, the BRL price MUST be approximately R$ 140.000,00 (depending on exchange), NEVER R$ 30.266,72.
- Double-check your math before outputting text: BRL value must ALWAYS be significantly higher than USD value due to the exchange rate.
`

    const finalSystemPrompt = assembledPrompt
      ? `${assembledPrompt}\n\n${technicalBridgeRules}\n\n${tonePrompt}\n\n${dynamicConstraints}`
      : `${systemPrompt}\n\n${systemPromptTemplate}\n\n${logisticsRulesPrompt}\n\n${technicalBridgeRules}\n\n${tonePrompt}\n\n${dynamicConstraints}`

    const dataContext = `
DADOS REAIS DO BANCO:
${JSON.stringify(products)}

INTELIGÊNCIA DE MERCADO:
${JSON.stringify(intelligence)}
    `

    const userPrompt = `${query}\n\nContexto Extra:\n${dataContext}`

    const apiKeyName = agent.api_key_secret_name
    let apiKey = ''
    if (apiKeyName) apiKey = Deno.env.get(apiKeyName) || ''

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          message: 'A chave de API não está configurada para o agente selecionado.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const providerType = agent.provider_type || agent.provider_name
    let message = ''

    if (providerType === 'openai' || providerType === 'deepseek') {
      const url =
        providerType === 'deepseek'
          ? 'https://api.deepseek.com/chat/completions'
          : 'https://api.openai.com/v1/chat/completions'
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: agent.model_id,
          temperature: temperature,
          messages: [
            { role: 'system', content: finalSystemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      message = data.choices?.[0]?.message?.content || ''
    } else if (providerType === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${agent.model_id}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `System:\n${finalSystemPrompt}\n\nUser:\n${userPrompt}` }],
              },
            ],
            generationConfig: { temperature: temperature },
          }),
        },
      )
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      message = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else if (providerType === 'custom' || providerType === 'anthropic') {
      const isAnthropic =
        providerType === 'anthropic' || (agent.custom_endpoint || '').includes('anthropic.com')
      const headers: any = { 'Content-Type': 'application/json' }
      let bodyObj: any = {}

      if (isAnthropic) {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
        bodyObj = {
          model: agent.model_id,
          max_tokens: 4096,
          temperature: temperature,
          system: finalSystemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
        bodyObj = {
          model: agent.model_id,
          temperature: temperature,
          messages: [
            { role: 'system', content: finalSystemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }
      }

      const res = await fetch(agent.custom_endpoint || 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (isAnthropic) {
        message = data.content?.[0]?.text || ''
      } else {
        message = data.choices?.[0]?.message?.content || ''
      }
    } else {
      throw new Error(`Provedor não suportado: ${providerType}`)
    }

    if (!message) {
      message = 'Não foi possível gerar uma resposta com o agente selecionado.'
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('process-query error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
