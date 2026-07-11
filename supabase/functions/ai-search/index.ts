import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}
import { getActiveAgents, generateResponse } from './intelligence.ts'
import {
  sanitizeInput,
  isInstitutionalQuery,
  checkKeywordRelevance,
  extractProducts,
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

const HP_GENERIC_FILTER_WORDS = new Set([
  'camera',
  'câmera',
  'cameras',
  'câmeras',
  'produto',
  'produtos',
  'equipamento',
  'equipamentos',
  'buscar',
  'pesquisar',
  'procurar',
  'quero',
  'preciso',
  'gostaria',
  'ache',
  'encontre',
  'mostrar',
  'ver',
])

function generalizeForHpSearch(query: string): string {
  const cleaned = cleanPortugueseGenericWords(query)
  const words = cleaned.split(/\s+/).filter((w) => !HP_GENERIC_FILTER_WORDS.has(w.toLowerCase()))
  const result = words.join(' ').trim()
  return result.length > 0 ? result : query
}

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

    let query = sanitizeInput(body?.query || '')
    const session_id = typeof body?.session_id === 'string' ? body.session_id : null
    const queryMentionsBrazil =
      /(?:brasil|brazil|sp|são paulo|entreg[ae]|frete|prazo|receber|nacional|nacionalizado|nacionalizados|nacionalizada|nacionalizadas|nacionalizad[oa]s|nota fiscal|nf|importado|dolar|real|reais|brl|usd|moeda|cotação|cotacao|conversão|conversao|preço no brasil|preco no brasil|preço brasil|preco brasil|entregar|entrega brasil|preço final|preco final|preço nacional|preco nacional|preço internac|preco internac)/i.test(
        query,
      )
    const lastReferencedProductId = body?.currentProductId || null
    const productPagePrompt =
      typeof body?.productPagePrompt === 'string' ? body.productPagePrompt : null
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    const execution_id = crypto.randomUUID()
    console.log(`[ai-search][execution] execution_id=${execution_id} query="${query}"`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    console.log(
      `[ai-search][env-check] SUPABASE_URL present=${!!supabaseUrl} length=${supabaseUrl.length} | SUPABASE_SERVICE_ROLE_KEY present=${!!supabaseServiceKey} length=${supabaseServiceKey.length}`,
    )

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const isHPMode = !lastReferencedProductId
    const secondarySearchTerm = isHPMode ? generalizeForHpSearch(query) : query
    const searchPromise: Promise<any[]> = isHPMode
      ? supabase
          .rpc('search_products_v2', { search_term: secondarySearchTerm, boost_multiplier: 1.0 })
          .then(({ data }: any) => (Array.isArray(data) ? data : []))
      : Promise.resolve([])

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
    console.log(
      `[ai-search] agentSettings found=${!!agentSettings} system_prompt_length=${(agentSettings?.system_prompt || '').length} settings_keys=${agentSettings ? Object.keys(agentSettings).join(',') : 'null'}`,
    )
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

    // Contextual product data (moved before cascade to enable technical intent detection)
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

    // Pronoun Resolution — replace demonstrative pronouns with actual product name on Product Page
    if (contextualProductData && (contextualProductData.id || lastReferencedProductId)) {
      const ppProductId = contextualProductData.id || lastReferencedProductId
      const ppProductName = contextualProductData.name || ''
      if (ppProductName) {
        const pronounPatterns = [
          'essa camera',
          'esta camera',
          'essa',
          'esta',
          'este produto',
          'esse produto',
          'esse',
          'dessa',
          'desta',
          'nessa',
          'nesta',
          'this camera',
          'this product',
          'this',
        ]
        const lowerQuery = query.toLowerCase()
        for (const pattern of pronounPatterns) {
          const patternLower = pattern.toLowerCase()
          const idx = lowerQuery.indexOf(patternLower)
          if (idx !== -1) {
            const beforeOk = idx === 0 || !/[a-zà-ÿ]/i.test(query[idx - 1])
            const afterIdx = idx + patternLower.length
            const afterOk = afterIdx >= query.length || !/[a-zà-ÿ]/i.test(query[afterIdx])
            if (beforeOk && afterOk) {
              query = query.slice(0, idx) + ppProductName + query.slice(afterIdx)
              console.log(`[ai-search] PP pronoun resolved: "${pattern}" → ID=${ppProductId}`)
              break
            }
          }
        }
      }
    }

    // Technical Intent Detection — skip search cascade if query is technical and product context exists
    const skipSearch =
      !!lastReferencedProductId && !!contextualProductData && isTechnicalQuery(query)
    if (skipSearch) {
      console.log(`[ai-search] Skipping cascade for technical question: "${query}"`)
    }

    // Stage A: Stop-words removal (skipped if technical intent detected)
    let searchQuery = query
    if (!skipSearch) {
      const stopWords = Array.isArray(aiSettings?.custom_stop_words)
        ? aiSettings.custom_stop_words
        : []
      searchQuery = removeStopWords(query, stopWords) || query
      logCascade('A', 'stopwords', true, query, `cleaned="${searchQuery}"`)
    }

    // Comparison Detection — detects "com a", "com o", "vs.", "versus", or "e" patterns
    let searchEntities: string[] = [searchQuery]
    let isComparisonDetected = false
    if (!skipSearch) {
      const comparison = detectComparison(query)
      if (comparison.isComparison) {
        isComparisonDetected = true
        searchEntities = comparison.terms
        console.log(`[ai-search] COMPARISON DETECTED terms=${JSON.stringify(comparison.terms)}`)
      } else if (lastReferencedProductId) {
        // PP Mode: On a product page, extract the target product mentioned after "com a" or "com o"
        const compareMatch = query.match(/(?:com a|com o)\s+(.+)/i)
        if (compareMatch && compareMatch[1]) {
          const extracted = compareMatch[1]
            .trim()
            .replace(/[.,;:!?\s]+$/, '')
            .trim()
          if (extracted.length > 0) {
            searchQuery = extracted
            searchEntities = [searchQuery]
            console.log(`[ai-search] PP compare mode: extracted target term="${extracted}"`)
          }
        }
      }
    }

    // Entity Extraction (skipped if technical intent or comparison detected)
    if (!skipSearch && !isComparisonDetected && searchQuery.trim().length > 0) {
      searchEntities = await extractEntities(searchQuery, openaiKey)

      if (searchEntities.length === 1 && searchEntities[0].length > 30) {
        const longEntity = searchEntities[0]
        const words = longEntity.split(/\s+/).slice(0, 3).join(' ')
        if (words.length > 0 && words.length < longEntity.length) {
          searchEntities.push(words)
          console.log(
            `[ai-search] added short fallback: "${words}" from long entity "${longEntity}"`,
          )
        }
      }
    }

    // Product Search (Stage C preparation) with deterministic entity fallback
    let level1Products: any[] = []
    if (!skipSearch && searchQuery.trim().length > 0) {
      const searchFn = async (term: string): Promise<any[]> => {
        console.log(`[ai-search] searchFn executing with term: "${term}"`)
        const { data: rpcData, error: rpcError } = await supabase.rpc('execute_ai_search_v3', {
          search_term: term,
        })
        const hasStock = rpcData && Array.isArray((rpcData as any)?.stock)
        const stockLen = hasStock ? (rpcData as any).stock.length : 0
        console.log(
          `[searchFn] term="${term}" rpcData type=${typeof rpcData} isArray=${Array.isArray(rpcData)} hasStock=${hasStock} stockLen=${stockLen}`,
        )
        console.log(
          `[ai-search][rpc-diagnostic] term="${term}" | typeof data=${typeof rpcData} | dataPreview=${JSON.stringify(rpcData).slice(0, 200)}`,
        )
        console.log(
          `[ai-search][rpc-diagnostic] error=${rpcError ? JSON.stringify(rpcError) : 'null'}`,
        )
        if (rpcError) {
          console.error(
            `[ai-search][rpc-error] execute_ai_search_v3 failed for term="${term}" | fullError=${JSON.stringify(rpcError)}`,
          )
          return []
        }
        const products = extractProducts(rpcData)
        console.log(`[ai-search] searchFn result count: ${products.length} for term="${term}"`)
        return products
      }
      const { products: allProducts, searchCount } = await searchAllEntities(
        searchEntities,
        searchQuery,
        searchFn,
      )
      level1Products = allProducts
      console.log(
        `[ai-search] multi-entity search completed: ${searchCount} terms returned results, total unique products=${level1Products.length} for query="${searchQuery}"`,
      )
    }
    level1Products = level1Products.filter((p: any) => p && p.id && (p.name || p.title || p.sku))
    console.log(
      `[ai-search] searchEntities=${JSON.stringify(searchEntities)} validProducts=${level1Products.length}`,
    )

    // PT-EN Fallback: if primary search returned zero products, try translated/cleaned/simplified terms
    if (!skipSearch && level1Products.length === 0 && searchQuery.trim().length > 0) {
      const fallbackTerms = generateFallbackTerms(searchQuery)
      if (fallbackTerms.length > 0) {
        console.log(`[ai-search] PT FALLBACK: trying [${fallbackTerms.join(', ')}]`)
        const seenIds = new Set<string>()
        const searchFnFallback = async (term: string): Promise<any[]> => {
          const { data: rpcData, error: rpcError } = await supabase.rpc('execute_ai_search_v3', {
            search_term: term,
          })
          if (rpcError) return []
          return extractProducts(rpcData)
        }
        for (const term of fallbackTerms) {
          try {
            const results = await searchFnFallback(term)
            for (const p of results) {
              if (p?.id && !seenIds.has(p.id)) {
                seenIds.add(p.id)
                level1Products.push(p)
              }
            }
          } catch (err) {
            console.error(`[ai-search] PT FALLBACK error for term="${term}":`, err)
          }
        }
        console.log(
          `[ai-search] PT FALLBACK completed: total products after fallback=${level1Products.length}`,
        )
      }
    }

    // Accessory Filtering: remove non-core products for generic (single-word) searches
    if (!skipSearch && level1Products.length > 0 && isGenericSearch(searchEntities)) {
      const { filtered, removedCount } = filterAccessories(level1Products)
      if (filtered.length >= 3) {
        console.log(
          `[ai-search] FILTER: removed ${removedCount} accessories, ${filtered.length} remain`,
        )
        level1Products = filtered
      }
    }

    // Post-processing: extract numeric filters (e.g. "20x zoom") and apply to product list
    const filters = extractFilters(query)
    if (filters.minZoom !== null && level1Products.length > 0) {
      const { filtered, wasFiltered } = applyZoomFilter(level1Products, filters.minZoom)
      console.log(
        `[filter] minZoom=${filters.minZoom} original=${level1Products.length} filtered=${filtered.length}`,
      )
      if (wasFiltered && filtered.length > 0) {
        level1Products = filtered
      }
    }

    const level1Context =
      level1Products.length > 0 ? buildProductContext(level1Products, queryMentionsBrazil) : []

    async function persistAndReturn(aiResult: any, type: string): Promise<Response> {
      const referencedInternalProducts = Array.isArray(aiResult.referenced_internal_products)
        ? [...aiResult.referenced_internal_products]
        : []
      let aiReferencedProducts = Array.isArray(aiResult.ai_referenced_products)
        ? [...aiResult.ai_referenced_products]
        : [...referencedInternalProducts]

      if (lastReferencedProductId && level1Context.length > 0) {
        const contextIds = level1Context
          .map((p: any) => p?.id)
          .filter((id: any) => id != null) as string[]
        for (const id of contextIds) {
          if (!referencedInternalProducts.includes(id)) {
            referencedInternalProducts.push(id)
            if (!aiReferencedProducts.includes(id)) {
              aiReferencedProducts.push(id)
            }
          }
        }
        console.log(
          `[ai-search] PP context merged: ${contextIds.length} IDs (${referencedInternalProducts.length} total)`,
        )
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
      // PP NUNCA envia full_search_results (evita "Produtos Relacionados MY WAY")
      const fullSearchResults = isHPMode ? await searchPromise : []
      console.log(
        `[ai-search] response: mode=${isHPMode ? 'HP' : 'PP'} full_search_results=${fullSearchResults.length} referenced=${referencedInternalProducts.length}`,
      )

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
          // PP: filtra o produto atual para não aparecer em "Produtos Relacionados"
          if (lastReferencedProductId) {
            result.products = result.products.filter((p: any) => p.id !== lastReferencedProductId)
            console.log(
              `[ai-search] PP filtered out current product (${lastReferencedProductId}), remaining products=${result.products.length}`,
            )
          }
        }
      }
      result.execution_id = execution_id
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const CATEGORY_KEYWORDS = [
      'camera',
      'cameras',
      'lente',
      'lentes',
      'microfone',
      'microfones',
      'tripé',
      'tripés',
      'monitor',
      'monitores',
      'ptz',
      '4k',
      'hdmi',
      'sdi',
      'ndi',
      'battery',
      'bateria',
      'light',
      'iluminação',
      'audio',
      'áudio',
      'video',
      'vídeo',
    ]

    function isCategoryQuery(q: string): boolean {
      const lower = q.toLowerCase()
      return CATEGORY_KEYWORDS.some((kw) => lower.includes(kw))
    }

    async function categoryResponse(productIds: string[]): Promise<Response> {
      const fullSearchResults = isHPMode ? await searchPromise : []
      return new Response(
        JSON.stringify({
          content: `Encontrei alguns produtos no catálogo relacionados a "${query}".`,
          confidence_level: 'medium',
          referenced_internal_products: productIds,
          should_show_whatsapp_button: false,
          ai_referenced_count: productIds.length,
          full_search_results: fullSearchResults,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    async function outOfScopeResponse(): Promise<Response> {
      if (isCategoryQuery(query) && level1Context.length > 0) {
        return categoryResponse(level1Context.map((p) => p.id).filter(Boolean))
      }
      const fullSearchResults = isHPMode ? await searchPromise : []
      return new Response(
        JSON.stringify({
          content: OUT_OF_SCOPE_MESSAGE,
          confidence_level: 'high',
          referenced_internal_products: [],
          should_show_whatsapp_button: false,
          ai_referenced_count: 0,
          full_search_results: fullSearchResults,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    // Technical Intent — bypass all cascade stages and answer directly from product context
    if (skipSearch) {
      const technicalProducts = contextualProductData
        ? buildProductContext([contextualProductData], queryMentionsBrazil)
        : []
      const aiResult = await generateResponse(
        query,
        {
          agentSettings,
          aiSettings,
          products: technicalProducts,
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
      return await persistAndReturn(aiResult, 'technical')
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
          productPagePrompt: productPagePrompt || undefined,
          currentProductContext: currentProductContext || undefined,
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
      if (isCategoryQuery(query) && level1Context.length > 0) {
        logCascade('E', 'keywords', true, query, '(category bypass)')
        return categoryResponse(level1Context.map((p) => p.id).filter(Boolean))
      }
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
          products: level1Context,
        },
        undefined,
        supabase,
      )
      return await persistAndReturn(aiResult, 'keywords')
    }

    // Stage F: General Fallback
    const kwCheckF = checkKeywordRelevance(searchQuery, keywordList)
    if (kwCheckF.isBlocked || kwCheckF.relevanceScore === 0) {
      if (isCategoryQuery(query) && level1Context.length > 0) {
        logCascade('F', 'general', true, query, '(category bypass)')
        return categoryResponse(level1Context.map((p) => p.id).filter(Boolean))
      }
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
      productPagePrompt: productPagePrompt || undefined,
      currentProductContext: currentProductContext || undefined,
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
