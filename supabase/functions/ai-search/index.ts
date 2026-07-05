import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getActiveAgents, generateResponse } from '../_shared/intelligence.ts'
import {
  sanitizeInput,
  isInstitutionalQuery,
  checkKeywordRelevance,
  extractProducts,
  buildProductContext,
  mergeProductResults,
  extractEntitiesHeuristic,
} from '../_shared/search-utils.ts'

const OUT_OF_SCOPE_MESSAGE =
  'Desculpe, só posso responder perguntas relacionadas com o nosso catálogo de produtos e serviços.'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    let body: any = null
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const query = sanitizeInput(body?.query || '')
    const session_id = typeof body?.session_id === 'string' ? body.session_id : null
    const lastReferencedProductId = body?.currentProductId || null

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

    const institutionalContext =
      Array.isArray(companyInfoRows) && companyInfoRows.length > 0
        ? companyInfoRows
            .filter((r: any) => r.type === 'ai_knowledge' || r.type === 'footer_about')
            .map((r: any) => `[${r.type || 'info'}] ${r.content || ''}`)
            .join('\n')
        : (companyInfoRows as any)?.content || ''

    const keywordList = Array.isArray(avproKeywords) ? avproKeywords : []

    const activeAgents = await getActiveAgents(supabase)
    if (activeAgents.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhum provedor de IA ativo configurado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    let searchEntities: string[] = [query]
    if (query && query.trim().length > 0) {
      searchEntities = extractEntitiesHeuristic(query)
    }

    let level1Products: any[] = []
    if (query && query.trim().length > 0) {
      const searchPromises = searchEntities.map((term) =>
        supabase.rpc('execute_ai_search_v3', { search_term: term }),
      )
      const searchResults = await Promise.all(searchPromises)
      level1Products = mergeProductResults(searchResults.map((r) => extractProducts(r.data)))
    }

    let keywordRelevant = false
    let isBlocked = false
    if (level1Products.length === 0 && query.trim().length > 0) {
      const kwCheck = checkKeywordRelevance(query, keywordList)
      isBlocked = kwCheck.isBlocked
      keywordRelevant = kwCheck.relevanceScore > 0
    }

    const isInst = query.trim().length > 0 ? isInstitutionalQuery(query) : false
    const hasProductContext = level1Products.length > 0
    const hasKeywordOrInstitutional = (keywordRelevant || isInst) && !isBlocked

    if (!hasProductContext && !hasKeywordOrInstitutional) {
      const outOfScopeResult = {
        message: OUT_OF_SCOPE_MESSAGE,
        confidence_level: 'high',
        referenced_internal_products: [],
        should_show_whatsapp_button: false,
      }
      if (session_id) {
        await supabase.from('chat_messages').insert([
          { session_id, role: 'user', message: query, content: query },
          {
            session_id,
            role: 'assistant',
            message: OUT_OF_SCOPE_MESSAGE,
            content: JSON.stringify(outOfScopeResult),
          },
        ])
      }
      return new Response(JSON.stringify(outOfScopeResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    let contextualProductData = null
    if (lastReferencedProductId) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(
          'id, name, sku, category, description, technical_info, image_url, manufacturer_id, manufacturers(name), price_usd, price_brl, price_cost, price_cost_rebate, price_nationalized_cost, price_nationalized_sales, price_usa_rebate',
        )
        .eq('id', lastReferencedProductId)
        .maybeSingle()
      if (!productError && product) {
        let techInfo = product.technical_info
        try {
          if (techInfo) techInfo = JSON.parse(techInfo)
        } catch {}
        contextualProductData = {
          ...product,
          technical_info: techInfo,
          manufacturer: (product.manufacturers as any)?.name || 'N/A',
        }
      }
    }

    const level1Context = hasProductContext ? buildProductContext(level1Products) : []

    if (session_id) {
      await supabase
        .from('chat_messages')
        .insert({ session_id, role: 'user', message: query, content: query })
    }

    const unifiedData = {
      products: level1Context,
      history,
      currentProductId: lastReferencedProductId,
      contextualProductData,
      manufacturerList,
      agentSettings,
      aiSettings,
      institutionalContext,
    }

    const aiResult = await generateResponse(query, unifiedData, undefined, supabase)

    if (session_id) {
      await supabase.from('chat_messages').insert({
        session_id,
        role: 'assistant',
        message: aiResult.content,
        content: JSON.stringify(aiResult),
      })
    }

    const result: any = {
      message: aiResult.content,
      confidence_level: aiResult.confidence_level,
      referenced_internal_products: aiResult.referenced_internal_products,
      should_show_whatsapp_button: aiResult.should_show_whatsapp_button,
    }

    if (typeof result.message === 'string') {
      result.message = result.message.trim()
      if (
        lastReferencedProductId &&
        globalSettingsMap['transparency_note'] &&
        result.referenced_internal_products.length > 0
      ) {
        result.message += '\n\n' + globalSettingsMap['transparency_note']
      }
    }

    if (result.referenced_internal_products.length > 0) {
      const { data: groundedProducts } = await supabase
        .from('products')
        .select(
          'id, name, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category, description, technical_info, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)',
        )
        .in('id', result.referenced_internal_products)
      if (groundedProducts) {
        result.products = groundedProducts.map((p: any) => ({
          ...p,
          manufacturer: (p.manufacturer as any)?.name || (p as any).manufacturer_name || 'N/A',
        }))
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('[ERRO GLOBAL]', error)
    return new Response(
      JSON.stringify({
        error:
          'Falha ao processar a busca em todos os provedores ativos. Tente novamente em instantes.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
