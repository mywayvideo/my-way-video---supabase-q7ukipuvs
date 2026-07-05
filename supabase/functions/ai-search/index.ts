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

function logCascade(stage: string, type: string, matched: boolean, query: string) {
  console.log(
    `[cascata] Stage ${stage} executed type=${type} matched=${matched} ts=${new Date().toISOString()} query="${query}"`,
  )
}

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
      if (Array.isArray(histRows))
        history = histRows.reverse().map((row) => ({ role: row.role, content: row.content }))
    }

    const { data: agentSettings } = await supabase
      .from('ai_agent_settings')
      .select('*')
      .maybeSingle()
    const { data: aiSettings } = await supabase.from('ai_settings').select('*').maybeSingle()
    const { data: globalSettings } = await supabase.from('settings').select('key, value')
    const { data: companyInfoRows } = await supabase.from('company_info').select('content, type')
    const { data: avproKeywords } = await supabase
      .from('avpro_keywords')
      .select('keyword, weight, is_blocking')
    const { data: manufacturers } = await supabase.from('manufacturers').select('name')
    const manufacturerList = manufacturers ? manufacturers.map((m) => m.name).join(', ') : ''

    const globalSettingsMap: Record<string, string> = {}
    if (Array.isArray(globalSettings))
      for (const s of globalSettings) if (s?.key && s?.value) globalSettingsMap[s.key] = s.value

    const institutionalContext =
      Array.isArray(companyInfoRows) && companyInfoRows.length > 0
        ? companyInfoRows
            .filter((r: any) => r.type === 'ai_knowledge' || r.type === 'footer_about')
            .map((r: any) => `[${r.type || 'info'}] ${r.content || ''}`)
            .join('\n')
        : (companyInfoRows as any)?.content || ''
    const keywordList = Array.isArray(avproKeywords) ? avproKeywords : []

    const activeAgents = await getActiveAgents(supabase)
    if (activeAgents.length === 0)
      return new Response(JSON.stringify({ error: 'Nenhum provedor de IA ativo configurado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })

    let searchEntities: string[] = [query]
    if (query.trim().length > 0) searchEntities = extractEntitiesHeuristic(query)

    let level1Products: any[] = []
    if (query.trim().length > 0) {
      const allProducts: any[] = []
      for (const term of searchEntities) {
        const { data: rpcData } = await supabase.rpc('execute_ai_search_v3', { search_term: term })
        allProducts.push(...extractProducts(rpcData))
      }
      level1Products = mergeProductResults([allProducts])
    }
    const level1Context = level1Products.length > 0 ? buildProductContext(level1Products) : []

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

    async function persistAndReturn(aiResult: any, type: string): Promise<Response> {
      if (session_id) {
        await supabase
          .from('chat_messages')
          .insert({ session_id, role: 'user', message: query, content: query })
        await supabase.from('chat_messages').insert({
          session_id,
          role: 'assistant',
          message: aiResult.content,
          content: JSON.stringify(aiResult),
          type,
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
        )
          result.message += '\n\n' + globalSettingsMap['transparency_note']
      }
      if (result.referenced_internal_products.length > 0) {
        const { data: groundedProducts } = await supabase
          .from('products')
          .select(
            'id, name, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, image_url, category, description, technical_info, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)',
          )
          .in('id', result.referenced_internal_products)
        if (groundedProducts)
          result.products = groundedProducts.map((p: any) => ({
            ...p,
            manufacturer: (p.manufacturer as any)?.name || (p as any).manufacturer_name || 'N/A',
          }))
      }
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    function outOfScopeResponse(): Response {
      return new Response(
        JSON.stringify({
          message: OUT_OF_SCOPE_MESSAGE,
          confidence_level: 'high',
          referenced_internal_products: [],
          should_show_whatsapp_button: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    // Stage A: Remove stop-words (implementation pending)
    logCascade('A', 'stopwords', true, query)

    // Stage B: Institutional
    const isInst = query.trim().length > 0 ? isInstitutionalQuery(query) : false
    if (isInst) {
      logCascade('B', 'institutional', true, query)
      const aiResult = await generateResponse(
        query,
        { agentSettings, aiSettings, institutionalContext, history, products: [] },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'institutional')
    }
    logCascade('B', 'institutional', false, query)

    // Stage C: Products
    if (level1Context.length > 0) {
      logCascade('C', 'products', true, query)
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          products: level1Context,
          manufacturerList,
          history,
          currentProductId: lastReferencedProductId,
          contextualProductData,
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'products')
    }
    logCascade('C', 'products', false, query)

    // Stage D: Manufacturers (in-memory filter)
    const manufacturerNames = manufacturers ? manufacturers.map((m) => m.name) : []
    const matchedManufacturers = manufacturerNames.filter((name) => {
      const nameLower = name.toLowerCase()
      return searchEntities.some(
        (entity) =>
          entity.toLowerCase().includes(nameLower) || nameLower.includes(entity.toLowerCase()),
      )
    })
    if (matchedManufacturers.length > 0) {
      logCascade('D', 'manufacturers', true, query)
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          manufacturerList: matchedManufacturers.join(', '),
          history,
          products: [],
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'manufacturers')
    }
    logCascade('D', 'manufacturers', false, query)

    // Stage E: Keywords
    const kwCheckE = checkKeywordRelevance(query, keywordList)
    if (kwCheckE.isBlocked) {
      logCascade('E', 'keywords', true, query)
      return outOfScopeResponse()
    }
    if (kwCheckE.relevanceScore > 0) {
      logCascade('E', 'keywords', true, query)
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          institutionalContext,
          manufacturerList,
          history,
          products: [],
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'keywords')
    }
    logCascade('E', 'keywords', false, query)

    // Stage F: General Fallback
    logCascade('F', 'general', true, query)
    const kwCheckF = checkKeywordRelevance(query, keywordList)
    if (kwCheckF.isBlocked || kwCheckF.relevanceScore === 0) {
      return outOfScopeResponse()
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
    const aiResultF = await generateResponse(query, unifiedData, undefined, supabase)
    return await persistAndReturn(aiResultF, 'general')
  } catch (error: any) {
    console.error('[ERRO GLOBAL]', error)
    return new Response(
      JSON.stringify({
        error:
          'Falha ao processar a busca em todos os provedores ativos. Tente novamente em instantes.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
