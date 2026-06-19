import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadCacheSettings } from '../../_shared/cacheSettings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function safeJSONParse(str: string, fallback: any = null): any {
  try {
    return JSON.parse(str)
  } catch (e) {}

  let cleaned = str.trim()

  cleaned = cleaned
    .replaceAll('``' + '`json', '')
    .replaceAll('``' + '`', '')
    .replaceAll('`', '')
    .trim()

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

  let repaired = cleaned
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/\u201C|\u201D/g, '"')
    .replace(/[\u0000-\u001F\u007F]/g, '')

  try {
    return JSON.parse(repaired)
  } catch (e) {
    return fallback
  }
}

function sanitizeInput(text: any): string {
  try {
    return JSON.stringify(String(text)).slice(1, -1)
  } catch {
    return ''
  }
}

serve(async (req: Request) => {
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

    const { miExpirationDays, productSearchCacheExpirationDays, productCacheExpirationDays } =
      await loadCacheSettings()

    const query = sanitizeInput(body?.query || '')
    const userName = sanitizeInput(body?.userName || 'Cliente')
    const session_id = typeof body?.session_id === 'string' ? body.session_id : null

    console.log(
      `[DEBUG] Entrada Processada: Usuário="${userName}", Query="${query}", Session="${session_id}"`,
    )

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    let history: any[] = []

    if (session_id) {
      const { data: histRows, error: histError } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', session_id)
        .order('created_at', { ascending: false })
        .limit(30)

      if (!histError && Array.isArray(histRows)) {
        history = histRows.reverse().map((row) => ({
          role: row.role,
          content: row.content,
        }))
      }
    }

    const lastReferencedProductId = body?.currentProductId || null

    console.log('[DEBUG] Buscando configurações e catálogo...')
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
      const { data: product } = await supabase
        .from('products')
        .select(
          'id, name, category, compatibility, connectors, mount, media_type, interfaces, manufacturer, description',
        )
        .eq('id', lastReferencedProductId)
        .maybeSingle()

      contextualProductData = product || null
      console.log(`[DEBUG] Contexto do produto carregado: ${contextualProductData?.name}`)
    }

    const systemPrompt = `
    ### IDENTIDADE DO AGENTE
    ${agentSettings?.system_prompt || ''}

    ### PROMPT ESPECÍFICO DA PÁGINA DE PRODUTO (SE ATIVADO)
    ${lastReferencedProductId ? aiSettings?.product_page_prompt || '' : ''}

    ### CONTEXTO DA PÁGINA DE PRODUTO (ATIVAÇÃO)
    ${lastReferencedProductId ? 'Esta conversa ocorre na Página de Produto. O usuário está consultando especificamente este produto e suas alternativas. Todas as respostas devem usar este produto como ponto de referência primário.' : ''}

    ### SUPRESSÃO DE PADRÕES ANTERIORES
    ${lastReferencedProductId ? 'Ignore padrões de resposta e estilos herdados do histórico. Siga exclusivamente o system_prompt, o product_page_prompt e o system_prompt_template.' : ''}

    ### TEMPLATE OPERACIONAL (RESTRITO À PÁGINA DE PRODUTO)
    ${lastReferencedProductId ? aiSettings?.system_prompt_template || '' : ''}

    ### REGRAS DE LOGÍSTICA
    ${aiSettings?.logistics_rules_prompt || ''}

    ### CONTEXTO DA EMPRESA
    ${companyInfo?.content || ''}

    ### FABRICANTES DISPONÍVEIS (CATÁLOGO OFICIAL)
    Você só pode sugerir produtos cujos fabricantes estejam nesta lista oficial da My Way:
    ${manufacturerList}
    Nunca sugira, invente ou recombine produtos de fabricantes fora desta lista.
    Se o usuário mencionar um fabricante inexistente, corrija gentilmente e redirecione para um dos fabricantes válidos acima.

    ### REGRAS DE VALIDAÇÃO DE MARCA E MODELO
    Sempre valide qualquer modelo mencionado pelo usuário contra a lista de fabricantes acima.  
    Se o usuário mencionar apenas o modelo (ex: “fx3”, “r5”, “pyxis 6k”), identifique automaticamente a marca correspondente usando o catálogo real.

    ### RESTRIÇÃO DE NOMES DE PRODUTO
    Use apenas nomes exatos de produtos presentes no catálogo.  
    Nunca invente variações, kits, bundles, combinações, versões alternativas ou extensões do nome original.  
    Se o usuário mencionar uma variação inexistente, normalize para o nome real mais próximo ou informe que o modelo exato não existe.
    Se não existir correspondência válida, comunique isso e sugira apenas modelos existentes dos fabricantes permitidos.

    ### REGRAS DE OURO (FORMATO FINAL DO JSON — PRIORIDADE SOMENTE SOBRE O FORMATO)
    1. A resposta FINAL deve ser apenas JSON, no formato exato:
    {
      "message": "...",
      "confidence_level": "high" | "low",
      "referenced_internal_products": [],
      "should_show_whatsapp_button": boolean
    }
    2. Nunca escrever nada fora do JSON.
    3. Nunca incluir raciocínio interno, notas ocultas, logs ou comentários.
    4. A saudação inicial e todo o conteúdo visível devem estar DENTRO de "message".
    5. "referenced_internal_products" deve conter TODOS os IDs usados na resposta, seguindo estritamente as regras do TEMPLATE OPERACIONAL.
    6. IDs nunca devem aparecer no texto visível ao usuário.
    7. Estas regras definem APENAS a forma do JSON final e NÃO anulam o system_prompt_template, nem regras internas de formatação, busca, preços ou referenciação.
    8. No modo Página de Produto, seguir as regras técnicas do TEMPLATE OPERACIONAL. No modo Home ou Busca Global, o campo "message" pode usar Markdown padrão livre.
    `
    console.log('[DEBUG] System Prompt montado (trecho):\n', systemPrompt.substring(0, 300) + '...')

    const messages: any[] = [{ role: 'system', content: systemPrompt }]

    if (lastReferencedProductId && contextualProductData) {
      messages.push({
        role: 'system',
        content:
          'CONTEXTUAL PRODUCT DATA (Sanitized):\n' +
          sanitizeInput(Object.values(contextualProductData).join('; ')),
      })
    }

    if (history.length > 0) {
      for (const h of history.slice(-8)) {
        messages.push({
          role: h.role,
          content: sanitizeInput(h.content),
        })
      }
    }

    messages.push({ role: 'user', content: query })

    if (session_id) {
      console.log(`[DEBUG] Salvando mensagem do usuário na sessão ${session_id}`)
      await supabase.from('chat_messages').insert({
        session_id,
        role: 'user',
        content: query,
      })
    }

    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_products',
          description: 'Busca produtos no catálogo My Way.',
          parameters: {
            type: 'object',
            properties: { search_term: { type: 'string' } },
            required: ['search_term'],
          },
        },
      },
    ]

    console.log('[DEBUG] 1a Chamada OpenAI (processando intenção)...')
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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

    let aiData: any = null
    try {
      aiData = await aiResponse.json()
    } catch (e) {
      console.error('[ERRO] JSON inválido da OpenAI (Fase 1):', e)
      return new Response(JSON.stringify({ error: 'Erro ao decodificar resposta da IA' }), {
        headers: corsHeaders,
        status: 500,
      })
    }

    if (!aiData?.choices?.length || !aiData.choices[0]?.message) {
      console.error('[ERRO] OpenAI retornou payload inválido (Fase 1):', aiData)
      return new Response(JSON.stringify({ error: 'Falha ao obter resposta da IA.' }), {
        headers: corsHeaders,
        status: 500,
      })
    }

    const aiMessage = aiData.choices[0].message
    console.log('[DEBUG] IA Resposta Bruta (Fase 1):', JSON.stringify(aiMessage))

    const allowedProductIds = new Set<string>()

    if (Array.isArray(aiMessage?.tool_calls) && aiMessage.tool_calls.length > 0) {
      console.log(`[DEBUG] IA acionou ${aiMessage.tool_calls.length} tool_call(s)`)

      messages.push({
        role: 'assistant',
        content: aiMessage.content ?? '',
        tool_calls: aiMessage.tool_calls,
      })

      for (const toolCall of aiMessage.tool_calls) {
        let stock: any[] = []
        let args = {}
        try {
          const rawArgs =
            toolCall?.function?.arguments && typeof toolCall.function.arguments === 'string'
              ? toolCall.function.arguments
              : '{}'

          args = JSON.parse(rawArgs)
        } catch (e) {
          console.error('[ERRO] Argumentos inválidos da tool_call:', toolCall, e)
        }

        const term = typeof (args as any)?.search_term === 'string' ? (args as any).search_term : ''
        console.log(`[DEBUG] Executando RPC execute_ai_search_v3 com search_term="${term}"`)

        try {
          const { data: rpcResult } = await supabase.rpc('execute_ai_search_v3', {
            search_term: term,
          })
          stock = Array.isArray(rpcResult?.stock) ? rpcResult.stock : []
          console.log(`[DEBUG] RPC retornou ${stock.length} produtos`)
          stock.forEach((p: any) => allowedProductIds.add(p.id))
        } catch (e) {
          console.error('[ERRO] Falha ao executar RPC execute_ai_search_v3:', e)
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(stock || []),
        })
      }

      console.log('[DEBUG] 2a Chamada OpenAI (resolvendo tools)...')
      const finalAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiSettings?.model_id || 'gpt-4o-mini',
          messages,
          response_format: { type: 'json_object' },
        }),
      })

      let finalData = null
      try {
        finalData = await finalAiResponse.json()
      } catch {
        console.error('[ERRO] Resposta final da IA é JSON inválido')
        return new Response(JSON.stringify({ error: 'Erro ao decodificar resposta final' }), {
          headers: corsHeaders,
          status: 500,
        })
      }

      if (!finalData?.choices?.length || !finalData.choices[0]?.message?.content) {
        console.error('[ERRO] OpenAI retornou payload final inválido (Fase 2):', finalData)
        return new Response(JSON.stringify({ error: 'Falha ao obter resposta final da IA.' }), {
          headers: corsHeaders,
          status: 500,
        })
      }

      aiMessage.content = finalData.choices[0].message.content
      console.log('[DEBUG] IA Resposta Final:', aiMessage.content)
    } else {
      console.log('[DEBUG] Nenhuma tool acionada. Finalizando fluxo.')
    }

    aiMessage.role = 'assistant'
    aiMessage.tool_calls = null
    delete aiMessage.refusal
    delete aiMessage.reasoning

    if (session_id) {
      console.log(`[DEBUG] Salvando mensagem do assistente na sessão ${session_id}`)
      await supabase.from('chat_messages').insert({
        session_id,
        role: 'assistant',
        content: aiMessage.content,
      })
    }

    const result = safeJSONParse(aiMessage.content, {
      message:
        globalSettingsMap['transparency_note'] ||
        'Desculpe, não consegui processar a resposta adequadamente.',
      confidence_level: 'low',
      referenced_internal_products: [],
      should_show_whatsapp_button: true,
    })

    if (!result.message || typeof result.message !== 'string') {
      result.message = globalSettingsMap['transparency_note'] || 'OK'
    }

    if (!Array.isArray(result.referenced_internal_products)) {
      result.referenced_internal_products = []
    }

    if (Array.isArray(result.referenced_internal_products)) {
      const originalCount = result.referenced_internal_products.length

      result.referenced_internal_products = result.referenced_internal_products.filter(
        (id: string) => {
          const ok = allowedProductIds.has(id)
          if (!ok) console.log(`[DEBUG] Removendo ID intruso ou não retornado na tool_call: ${id}`)
          return ok
        },
      )

      const validatedCount = result.referenced_internal_products.length

      if (validatedCount === 0 && originalCount > 0) {
        console.log('[DEBUG] Todos os IDs sugeridos foram rejeitados. Fallback de segurança.')
        result.referenced_internal_products = []
      }

      console.log(`[DEBUG] IDs validados na resposta final: ${validatedCount} de ${originalCount}`)
    }

    if (typeof result.message === 'string') {
      result.message = result.message.trim()
      if (lastReferencedProductId && globalSettingsMap['transparency_note']) {
        result.message += '\n\n' + globalSettingsMap['transparency_note']
      }
    } else {
      result.message = String(result.message || '').trim()
      if (lastReferencedProductId && globalSettingsMap['transparency_note']) {
        result.message += '\n\n' + globalSettingsMap['transparency_note']
      }
    }

    console.log(
      '[DEBUG] JSON Retornado ao Cliente:',
      JSON.stringify(result).substring(0, 300) + '...',
    )

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
