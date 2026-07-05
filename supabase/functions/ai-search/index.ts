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
  extractEntities,
  removeStopWords,
  searchWithEntityFallback,
} from '../_shared/search-utils.ts'

const OUT_OF_SCOPE_MESSAGE =
  'Desculpe, só posso responder perguntas relacionadas com o nosso catálogo de produtos e serviços.'

function logCascade(stage: string, type: string, matched: boolean, query: string, extra?: string) {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` ${extra}` : ''
  console.log(
    `[cascata] Stage ${stage} executed type=${type} matched=${matched}${extraStr} ts=${ts} query="${query}"`,
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
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''

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

    // Stage A: Stop-words removal
    const stopWords = Array.isArray(aiSettings?.custom_stop_words)
      ? aiSettings.custom_stop_words
      : []
    const searchQuery = removeStopWords(query, stopWords) || query
    logCascade('A', 'stopwords', true, query, `cleaned="${searchQuery}"`)

    // Entity Extraction
    let searchEntities: string[] = [searchQuery]
    if (searchQuery.trim().length > 0) {
      searchEntities = await extractEntities(searchQuery, openaiKey)
    }

    // Product Search (Stage C preparation) with deterministic entity fallback
    let level1Products: any[] = []
    if (searchQuery.trim().length > 0) {
      const searchFn = async (term: string): Promise<any[]> => {
        console.log(`[ai-search] searchFn executing with term: "${term}"`)
        const { data: rpcData, error: rpcError } = await supabase.rpc('execute_ai_search_v3', {
          search_term: term,
        })
        const products = extractProducts(rpcData)
        console.log(
          `[ai-search] searchFn result count: ${products.length}, error: ${rpcError ? JSON.stringify(rpcError) : 'null'}`,
        )
        return products
      }
      const { products: fallbackProducts, usedFallback } = await searchWithEntityFallback(
        searchEntities,
        searchQuery,
        searchFn,
      )
      level1Products = fallbackProducts
      if (usedFallback) {
        console.log(
          `[ai-search] entity fallback produced results count=${level1Products.length} for query="${searchQuery}"`,
        )
      }
    }
    level1Products = level1Products.filter((p: any) => p && p.id && (p.name || p.title || p.sku))
    console.log(
      `[ai-search] searchEntities=${JSON.stringify(searchEntities)} validProducts=${level1Products.length}`,
    )
    const level1Context = level1Products.length > 0 ? buildProductContext(level1Products) : []

    // Contextual product data
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

    // Stage B: Institutional
    if (searchQuery.trim().length > 0 && isInstitutionalQuery(searchQuery)) {
      logCascade('B', 'institutional', true, query)
      const aiResult = await generateResponse(
        query,
        { agentSettings, aiSettings, institutionalContext, history, products: [] },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'institutional')
    }

    // Stage C: Products
    if (level1Context.length > 0) {
      logCascade('C', 'products', true, query, `products=${level1Context.length}`)
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
      logCascade('D', 'manufacturers', true, query, `manufacturers=${matchedManufacturers.length}`)
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

    // Stage E: Keywords
    const kwCheckE = checkKeywordRelevance(searchQuery, keywordList)
    if (kwCheckE.isBlocked) {
      logCascade('E', 'keywords', false, query, '(blocked)')
      return outOfScopeResponse()
    }
    if (kwCheckE.relevanceScore > 0) {
      logCascade('E', 'keywords', true, query, `relevance=${kwCheckE.relevanceScore}`)
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

    // Stage F: General Fallback
    const kwCheckF = checkKeywordRelevance(searchQuery, keywordList)
    if (kwCheckF.isBlocked || kwCheckF.relevanceScore === 0) {
      logCascade('F', 'general', false, query, '(blocked by system)')
      return outOfScopeResponse()
    }
    logCascade('F', 'general', true, query, `(fallback) relevance=${kwCheckF.relevanceScore}`)
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
