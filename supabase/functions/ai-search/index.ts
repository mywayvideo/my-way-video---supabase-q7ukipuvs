import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

import { getActiveAgents, generateResponse } from './intelligence.ts'
import { classifyIntent } from './intention.ts'
import {
  sanitizeInput,
  isInstitutionalQuery,
  checkKeywordRelevance,
  buildProductContext,
  mergeProductResults,
  extractEntities,
  removeStopWords,
  searchAllEntities,
  isTechnicalQuery,
  extractFilters,
  applyZoomFilter,
  detectComparison,
  generateFallbackTerms,
  isGenericSearch,
  filterAccessories,
  cleanPortugueseGenericWords,
} from './search-utils.ts'

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

  const url = new URL(req.url)
  const isClassifierRoute = url.pathname.endsWith('/classifier')

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

    if (isClassifierRoute) {
      const classifierQuery = typeof body?.query === 'string' ? body.query : ''
      const currentProduct = body?.currentProduct || undefined
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const classifierSupabase = createClient(supabaseUrl, supabaseServiceKey)
      const result = await classifyIntent(classifierQuery, classifierSupabase, currentProduct)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const query = sanitizeInput(body?.query || '')
    const session_id = typeof body?.session_id === 'string' ? body.session_id : null
    const lastReferencedProductId = body?.currentProductId || null
    const productPagePrompt =
      typeof body?.productPagePrompt === 'string' ? body.productPagePrompt : null
    const execution_id = crypto.randomUUID()
    const isHPMode = !lastReferencedProductId

    console.log(`[ai-search][execution] execution_id=${execution_id} query="${query}"`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

    let contextualProductData = null
    if (lastReferencedProductId) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(
          'id, name, sku, category, description, technical_info, image_url, manufacturer_id, manufacturers(name), price_usd, price_nationalized_sales, price_nationalized_currency, price_usa_rebate',
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

    const currentProductContext = contextualProductData
      ? {
          id: (contextualProductData.id as string) || lastReferencedProductId || '',
          name: (contextualProductData.name as string) || '',
          manufacturer: (contextualProductData.manufacturer as string) || '',
          category: (contextualProductData.category as string) || '',
        }
      : null

    const currentProductForClassifier = lastReferencedProductId
      ? {
          id: lastReferencedProductId,
          name: contextualProductData?.name || undefined,
          manufacturer: contextualProductData?.manufacturer || undefined,
          category: contextualProductData?.category || undefined,
        }
      : undefined

    let classificationIntent: string | null = null
    let classificationTerms: string[] = []
    try {
      const classification = await classifyIntent(query, supabase, currentProductForClassifier)
      classificationIntent = classification.intent
      classificationTerms = classification.searchTerms || []
      console.log(
        `[ai-search] classifier: intent=${classificationIntent} terms=[${classificationTerms.join(', ')}]`,
      )
    } catch (err: any) {
      console.error('[ai-search] classifier failed, using fallback:', err?.message || err)
    }

    const hpSearchTerm = isHPMode ? cleanPortugueseGenericWords(query) : query
    const searchPromise: Promise<any[]> = isHPMode
      ? supabase
          .rpc('search_products_v2', { search_term: hpSearchTerm, boost_multiplier: 1.0 })
          .then(({ data }: any) => (Array.isArray(data) ? data : []))
      : Promise.resolve([])

    const searchQuery = removeStopWords(query) || query
    logCascade('A', 'stopwords', true, query, `cleaned="${searchQuery}"`)

    const isInstClassification =
      classificationIntent !== null
        ? classificationIntent === 'institutional'
        : searchQuery.trim().length > 0 && isInstitutionalQuery(searchQuery)
    if (isInstClassification) {
      logCascade('B', 'institutional', true, query)
      try {
        const aiResult = await generateResponse(
          query,
          { agentSettings, aiSettings, institutionalContext, history, products: [] },
          undefined,
          supabase,
        )
        if (session_id) {
          await supabase
            .from('chat_messages')
            .insert({ session_id, role: 'user', message: query, content: query })
          await supabase.from('chat_messages').insert({
            session_id,
            role: 'assistant',
            message: aiResult.content,
            content: JSON.stringify({ ...aiResult, referenced_internal_products: [] }),
            type: 'institutional',
          })
        }
        let instContent = aiResult.content
        if (typeof instContent === 'string') {
          instContent = instContent.trim()
          if (instContent.startsWith('{') && instContent.includes('"content"')) {
            try {
              const parsed = JSON.parse(instContent)
              if (parsed && typeof parsed.content === 'string') {
                instContent = parsed.content.trim()
              }
            } catch {}
          }
        }
        const instResult = {
          content: instContent,
          confidence_level: aiResult.confidence_level || 'high',
          referenced_internal_products: [],
          should_show_whatsapp_button: aiResult.should_show_whatsapp_button ?? false,
          ai_referenced_count: 0,
          full_search_results: [],
          execution_id,
        }
        return new Response(JSON.stringify(instResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      } catch (instErr: any) {
        console.error(
          '[ai-search] institutional generateResponse failed:',
          instErr?.message || instErr,
        )
        const fallbackResult = {
          content: 'Desculpe, não encontrei informações institucionais no momento.',
          confidence_level: 'medium',
          referenced_internal_products: [],
          should_show_whatsapp_button: true,
          ai_referenced_count: 0,
          full_search_results: [],
          execution_id,
        }
        return new Response(JSON.stringify(fallbackResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
    }

    let searchEntities = extractEntities(searchQuery)
    console.log('[ai-search] searchEntities:', JSON.stringify(searchEntities))

    if (classificationTerms.length > 0) {
      const termSet = new Set(searchEntities.map((e: string) => e.toLowerCase()))
      for (const term of classificationTerms) {
        if (!termSet.has(term.toLowerCase())) {
          searchEntities.push(term)
        }
      }
      console.log(
        '[ai-search] searchEntities after classifier injection:',
        JSON.stringify(searchEntities),
      )
    }

    let level1Products: any[] = []
    if (searchQuery.trim().length > 0 && searchEntities.length > 0) {
      level1Products = await searchAllEntities(supabase, searchEntities)
    }

    if (level1Products.length === 0 && searchQuery.trim().length > 0) {
      const fallbackTerms = generateFallbackTerms(searchQuery)
      if (fallbackTerms.length > 0) {
        console.log(`[ai-search] PT FALLBACK: trying [${fallbackTerms.join(', ')}]`)
        const fallbackProducts = await searchAllEntities(supabase, fallbackTerms)
        level1Products = mergeProductResults([level1Products, fallbackProducts])
        console.log(`[ai-search] PT FALLBACK completed: total products=${level1Products.length}`)
      }
    }

    if (level1Products.length > 0 && isGenericSearch(searchQuery)) {
      level1Products = filterAccessories(level1Products)
    }

    const filters = extractFilters(query)
    if (Object.keys(filters).length > 0 && level1Products.length > 0) {
      const filtered = applyZoomFilter(level1Products, filters)
      if (filtered.length > 0) level1Products = filtered
    }

    const isComparison = detectComparison(query)
    if (isComparison) {
      console.log(`[ai-search] COMPARISON DETECTED`)
    }

    const level1ContextStr = buildProductContext(level1Products)
    console.log(`[ai-search] level1Products: ${level1Products.length} products`)

    async function persistAndReturn(aiResult: any, type: string): Promise<Response> {
      let referencedInternalProducts = Array.isArray(aiResult.referenced_internal_products)
        ? [...aiResult.referenced_internal_products]
        : []
      let aiReferencedProducts = Array.isArray(aiResult.ai_referenced_products)
        ? [...aiResult.ai_referenced_products]
        : [...referencedInternalProducts]

      if (
        lastReferencedProductId &&
        !referencedInternalProducts.includes(lastReferencedProductId)
      ) {
        referencedInternalProducts.push(lastReferencedProductId)
        if (!aiReferencedProducts.includes(lastReferencedProductId)) {
          aiReferencedProducts.push(lastReferencedProductId)
        }
      }

      const aiReferencedCount = aiReferencedProducts.length

      if (session_id) {
        await supabase
          .from('chat_messages')
          .insert({ session_id, role: 'user', message: query, content: query })
        await supabase.from('chat_messages').insert({
          session_id,
          role: 'assistant',
          message: aiResult.content,
          content: JSON.stringify({
            ...aiResult,
            referenced_internal_products: referencedInternalProducts,
            ai_referenced_products: aiReferencedProducts,
          }),
          type,
        })
      }

      const fullSearchResults = isHPMode ? await searchPromise : []

      if (lastReferencedProductId) {
        const idxRef = referencedInternalProducts.indexOf(lastReferencedProductId)
        if (idxRef !== -1) referencedInternalProducts.splice(idxRef, 1)
        const idxAi = aiReferencedProducts.indexOf(lastReferencedProductId)
        if (idxAi !== -1) aiReferencedProducts.splice(idxAi, 1)
      }

      const result: any = {
        content: aiResult.content,
        confidence_level: aiResult.confidence_level,
        referenced_internal_products: referencedInternalProducts,
        ai_referenced_products: aiReferencedProducts,
        should_show_whatsapp_button: aiResult.should_show_whatsapp_button,
        ai_referenced_count: aiReferencedCount,
        full_search_results: fullSearchResults,
      }

      if (typeof result.content === 'string') {
        result.content = result.content.trim()
        if (result.content.startsWith('{') && result.content.includes('"content"')) {
          try {
            const parsed = JSON.parse(result.content)
            if (parsed && typeof parsed.content === 'string') {
              result.content = parsed.content.trim()
              console.log(`[ai-search] extracted content from JSON-wrapped response`)
            }
          } catch {}
        }
        if (
          lastReferencedProductId &&
          globalSettingsMap['transparency_note'] &&
          result.referenced_internal_products.length > 0
        )
          result.content += '\n\n' + globalSettingsMap['transparency_note']
      }

      if (result.referenced_internal_products.length > 0) {
        const { data: groundedProducts } = await supabase
          .from('products')
          .select(
            'id, name, price_usd, price_nationalized_sales, price_nationalized_currency, image_url, category, description, technical_info, sku, weight, is_discontinued, price_usa_rebate, date_rebate, manufacturer_id, manufacturer:manufacturers(name)',
          )
          .in('id', result.referenced_internal_products)
        if (groundedProducts) {
          const aiIdSet = new Set(aiReferencedProducts)
          result.products = groundedProducts
            .map((p: any) => ({
              ...p,
              manufacturer: (p.manufacturer as any)?.name || (p as any).manufacturer_name || 'N/A',
            }))
            .sort((a: any, b: any) => {
              const aIsAi = aiIdSet.has(a.id) ? 0 : 1
              const bIsAi = aiIdSet.has(b.id) ? 0 : 1
              return aIsAi - bIsAi
            })
        }
      }

      result.execution_id = execution_id
      console.log(
        `[ai-search] response: mode=${isHPMode ? 'HP' : 'PP'} full_search_results=${fullSearchResults.length} referenced=${referencedInternalProducts.length}`,
      )
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    function outOfScopeResponse(): Response {
      return new Response(
        JSON.stringify({
          content: OUT_OF_SCOPE_MESSAGE,
          confidence_level: 'high',
          referenced_internal_products: [],
          should_show_whatsapp_button: false,
          ai_referenced_count: 0,
          full_search_results: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    if (level1Products.length > 0) {
      logCascade('C', 'products', true, query, `products=${level1Products.length}`)
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          products: level1Products,
          manufacturerList,
          history,
          currentProductId: lastReferencedProductId,
          contextualProductData,
          productPagePrompt: productPagePrompt || undefined,
          currentProductContext: currentProductContext || undefined,
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'products')
    }

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

    const isRelevant = checkKeywordRelevance(
      searchQuery,
      keywordList.map((k: any) => k.keyword),
    )
    if (!isRelevant) {
      logCascade('E', 'keywords', false, query, '(blocked)')
      return outOfScopeResponse()
    }

    logCascade('E', 'keywords', true, query, `relevance=true`)
    const aiResult = await generateResponse(
      query,
      {
        agentSettings,
        aiSettings,
        institutionalContext,
        manufacturerList,
        history,
        products: level1Products,
      },
      undefined,
      supabase,
    )
    return await persistAndReturn(aiResult, 'keywords')
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
