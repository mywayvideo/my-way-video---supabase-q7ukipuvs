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

const IMAGE_PROXY_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/image-proxy`

const OUT_OF_SCOPE_MESSAGE =
  'Desculpe, só posso responder perguntas relacionadas com o nosso catálogo de produtos e serviços.'

function logCascade(stage: string, type: string, matched: boolean, query: string, extra?: string) {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` ${extra}` : ''
  console.log(
    `[cascata] Stage ${stage} executed type=${type} matched=${matched}${extraStr} ts=${ts} query="${query}"`,
  )
}

function applyCustomStopWords(q: string, stopWords: string[]): string {
  if (!q || stopWords.length === 0) return q
  const words = q.split(/\s+/)
  const stopSet = new Set(stopWords.map((w) => w.trim().toLowerCase()))
  return words.filter((w) => !stopSet.has(w.toLowerCase())).join(' ')
}

// ── Sanitize: remove tags internas ──
function sanitizeInstitutional(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/\[ai_knowledge\]\s*/gi, '')
    .replace(/\[company_info\]\s*/gi, '')
    .replace(/\[footer_about\]\s*/gi, '')
    .replace(/\[.*?\]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── Filter: retorna só o trecho relevante para a pergunta ──
function filterInstitutionalByQuery(raw: string, query: string): string {
  const cleaned = sanitizeInstitutional(raw)
  const q = query.toLowerCase()

  // Extrair seções do texto institucional
  const extractSection = (label: string, nextLabel?: string): string => {
    const idx = cleaned.indexOf(label)
    if (idx === -1) return ''
    const from = idx + label.length
    if (nextLabel) {
      const nextIdx = cleaned.indexOf(nextLabel, from)
      return nextIdx !== -1 ? cleaned.slice(from, nextIdx).trim() : cleaned.slice(from).trim()
    }
    return cleaned.slice(from).trim()
  }

  // Mapear seções conhecidas (em ordem de aparição no texto)
  const sections = {
    companyName: 'Company name:',
    address: 'Address:',
    phone: 'Phone/WhatsApp:',
    hours: 'Horário de funcionamento:',
    institutional: 'Texto Institucional:',
  }

  // 1) Se perguntou por telefone/contato
  if (/telefone|whatsapp|whats|phone|contato|ligar|falar|fone/i.test(q)) {
    const phoneSection = extractSection(sections.phone, sections.hours)
    const hoursSection = extractSection(sections.hours, sections.institutional)
    if (phoneSection) {
      let response = `📞 ${phoneSection}`
      // Opcional: inclui horário junto, pois telefone + horário andam juntos
      if (hoursSection) response += `\n🕐 ${hoursSection}`
      return response
    }
  }

  // 2) Se perguntou por horário
  if (/horário|horario|funcionamento|abre|fecha|aberto|hours|schedule|abrir/i.test(q)) {
    const hoursSection = extractSection(sections.hours, sections.institutional)
    const phoneSection = extractSection(sections.phone, sections.hours)
    if (hoursSection) {
      let response = `🕐 ${hoursSection}`
      if (phoneSection) response = `📞 ${phoneSection}\n🕐 ${hoursSection}`
      return response
    }
  }

  // 3) Se perguntou por endereço/local
  if (/endereço|endereco|local|onde fica|address|located|sede|fica/i.test(q)) {
    const addressSection = extractSection(sections.address, sections.phone)
    const companySection = extractSection(sections.companyName, sections.address)
    if (addressSection) {
      let response = `📍 ${addressSection}`
      if (companySection) response = `${companySection}\n📍 ${addressSection}`
      return response
    }
  }

  // 4) Se perguntou por entrega/frete/shipping
  if (/entrega|frete|shipping|delivery|envio|entregam|prazo/i.test(q)) {
    const instSection = extractSection(sections.institutional)
    // Dentro do texto institucional, procura por "entregamos" ou "envio"
    const deliveryMatch = instSection.match(/[^.]*?(entregamos|envio|shipping|delivery)[^.]*\./gi)
    if (deliveryMatch) {
      return deliveryMatch.join('\n')
    }
    // Fallback: retorna parágrafo institucional completo
    return instSection || cleaned
  }

  // 5) Fallback: pergunta institucional genérica → texto completo limpo
  return cleaned
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
    const customStopWords: string[] = Array.isArray(aiSettings?.custom_stop_words)
      ? aiSettings.custom_stop_words
      : []
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
    const hpSearchTermCleaned = applyCustomStopWords(hpSearchTerm, customStopWords)
    console.log(
      `[hp-search] original="${query}" afterClean="${hpSearchTerm}" afterStopWords="${hpSearchTermCleaned}"`,
    )
    const searchPromise: Promise<any[]> = isHPMode
      ? supabase
          .rpc('execute_ai_search_v3', { search_term: hpSearchTermCleaned })
          .then(({ data }: any) => (data?.stock ? data.stock : []))
      : Promise.resolve([])

    const searchQuery = removeStopWords(query) || query
    logCascade('A', 'stopwords', true, query, `cleaned="${searchQuery}"`)

    const isInstClassification =
      classificationIntent !== null
        ? classificationIntent === 'institutional'
        : searchQuery.trim().length > 0 && isInstitutionalQuery(searchQuery)
    if (isInstClassification) {
      logCascade('B', 'institutional', true, query)

      let instContent = ''
      if (institutionalContext && institutionalContext.trim().length > 0) {
        instContent = filterInstitutionalByQuery(institutionalContext, query)
      } else {
        instContent =
          'Para informações sobre nossa loja, entre em contato pelo WhatsApp ou telefone.'
      }

      try {
        if (session_id) {
          await supabase
            .from('chat_messages')
            .insert({ session_id, role: 'user', message: query, content: query })
          await supabase.from('chat_messages').insert({
            session_id,
            role: 'assistant',
            message: instContent,
            content: JSON.stringify({
              content: instContent,
              confidence_level: 'high',
              referenced_internal_products: [],
              should_show_whatsapp_button: false,
              ai_referenced_count: 0,
              full_search_results: 0,
              type: 'institutional',
            }),
            type: 'institutional',
          })
        }
      } catch (persistErr: any) {
        console.error(
          '[ai-search] institutional persistence failed:',
          persistErr?.message || persistErr,
        )
      }

      const instResult = {
        content: instContent,
        confidence_level: 'high',
        referenced_internal_products: [],
        should_show_whatsapp_button: false,
        ai_referenced_count: 0,
        full_search_results: 0,
        execution_id,
      }
      return new Response(JSON.stringify(instResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
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
    // === DETECÇÃO DE QUERY COMPARATIVA ===
    // Se a query contém palavras-chave de comparação, extrai entidades
    // e faz múltiplas chamadas ao search_products_v2
    async function executeComparisonSearch(query: string, supabase: any): Promise<any[]> {
      const lowerQuery = query.toLowerCase()

      // Detecta padrões de comparação
      const comparisonPatterns = [
        /compare\s+(.+?)\s+(?:com|e|vs|versus|contra|x)\s+(.+)/i,
        /comparar\s+(.+?)\s+(?:com|e|vs|versus|contra|x)\s+(.+)/i,
        /(.+?)\s+(?:vs|versus|x|ou|e)\s+(.+)/i,
        /melhores?\s+(.+?)\s+(?:e|com)\s+(.+)/i,
        /diferença\s+(?:entre\s+)?(.+?)\s+(?:e|com)\s+(.+)/i,
      ]

      let match: RegExpExecArray | null = null
      for (const pattern of comparisonPatterns) {
        match = pattern.exec(lowerQuery)
        if (match) break
      }

      // ✅ NOVO BLOCO AQUI:
      // Se não detectou padrão A vs B, mas está em PP
      if (!match && currentProductContext) {
        console.log(`[comparison] PP mode — single target search: "${query}"`)
        const searchResult = await supabase.rpc('execute_ai_search_v3', {
          search_term: query,
        })
        const foundProducts = searchResult.data?.stock || []
        if (foundProducts.length > 0) {
          const targetIds = foundProducts.map((p: any) => p.id)
          const { data: fullProducts } = await supabase
            .from('products')
            .select('*, manufacturer_id, manufacturers(name)')
            .in('id', targetIds)
          const mappedProducts = (fullProducts || []).map((p: any) => ({
            ...p,
            manufacturer: p.manufacturers?.name || p.manufacturer || null,
          }))
          return mappedProducts.slice(0, 10)
        }
      }

      // Se não detectou padrão E não está em PP, retorna vazio
      if (!match) return []

      // Extrai as duas partes da comparação
      const part1 = match[1]
        .trim()
        .replace(/\b(d[aeo]s?\s*)?(melhor|melhores)\b/g, '')
        .trim()
      const part2 = match[2]
        .trim()
        .replace(/\b(d[aeo]s?\s*)?(melhor|melhores)\b/g, '')
        .trim()

      // Extrai fabricantes/termos relevantes de cada parte
      const manufacturerPatterns = ['sony', 'canon', 'datavideo', 'panasonic', 'jvc', 'blackmagic']

      // Usa a parte COMPLETA como termo de busca, não só o fabricante
      const searchTerms1 = part1
      const searchTerms2 = part2

      // Limpa stop words de cada termo antes de buscar
      const q1 = cleanPortugueseGenericWords(searchTerms1) || searchTerms1
      const q2 = cleanPortugueseGenericWords(searchTerms2) || searchTerms2

      console.log(`[comparison] Split query: "${q1}" | "${q2}"`)

      const [result1, result2] = await Promise.all([
        supabase.rpc('execute_ai_search_v3', { search_term: q1 }),
        supabase.rpc('execute_ai_search_v3', { search_term: q2 }),
      ])

      const data1 = result1.data?.stock || []
      const data2 = result2.data?.stock || []

      console.log('[comparison] result1 count:', data1.length, '| result2 count:', data2.length)
      console.log('[comparison] result1 ids:', data1.map((p) => p.id).join(','))
      console.log('[comparison] result2 ids:', data2.map((p) => p.id).join(','))

      // Une e deduplica
      const allIds = [...new Set([...ids1, ...ids2])]

      if (allIds.length === 0) return []

      // Busca os produtos completos
      const { data: fullProducts } = await supabase
        .from('products')
        .select('*, manufacturer_id, manufacturers(name)') // ← JOINS COM FABRICANTE
        .in('id', allIds)

      // Preserva a ordem: produtos da query 1 primeiro, depois query 2
      const orderedIds = [...ids1, ...ids2.filter((id: string) => !ids1.includes(id))]

      const result = orderedIds
        .map((id: string) => {
          const p = (fullProducts || []).find((p: any) => p.id === id)
          if (!p) return null
          return {
            ...p,
            manufacturer: p.manufacturers?.name || p.manufacturer || null,
          }
        })
        .filter(Boolean)
        .slice(0, 10)

      console.log(`[comparison] Total unique products: ${result.length}`)
      return result
    }

    // ── Variáveis de escopo do handler ──
    let level1Products: any[] = []
    let featured: any[] = []
    let cards: any[] = []
    let aiResult: any = { content: '' }
    let contextForAI: any = {
      agentSettings,
      aiSettings,
      products: [],
      manufacturerList: [],
      history,
      currentProductId: lastReferencedProductId,
      contextualProductData,
      productPagePrompt: productPagePrompt || undefined,
      currentProductContext: currentProductContext || undefined,
      imageProxyUrl: IMAGE_PROXY_URL,
    }
    const SEARCHABLE = [
      'categorizar',
      'catalog',
      'comparison',
      'specs',
      'product',
      'features',
      'accessory',
    ]

    // ── Stage C: Search Products ──
    if (SEARCHABLE.includes(classificationIntent) && query && query.trim().length > 0) {
      try {
        // MODO COMPARAÇÃO: usa APENAS query limpa via stop words, SEM classificationTerms
        const comparisonQuery = applyCustomStopWords(
          cleanPortugueseGenericWords(query),
          customStopWords,
        )

        console.log(`[cascata][comparison] original="${query}" cleaned="${comparisonQuery}"`)

        const comparisonResults = await executeComparisonSearch(comparisonQuery, supabase)

        if (comparisonResults.length > 0) {
          level1Products = comparisonResults
          featured = comparisonResults
          cards = comparisonResults

          console.log(`[cascata] Stage C: comparison mode — ${comparisonResults.length} products`)

          contextForAI = {
            agentSettings,
            aiSettings,
            products: featured,
            manufacturerList,
            history,
            currentProductId: lastReferencedProductId,
            contextualProductData,
            productPagePrompt: productPagePrompt || undefined,
            currentProductContext: currentProductContext || undefined,
            imageProxyUrl: IMAGE_PROXY_URL, // ← ADICIONE AQUI
          }

          // ✅ GERAR RESPOSTA AI ANTES DE RETORNAR
          aiResult = await generateResponse(query, contextForAI, undefined, supabase)

          const productLookup = new Map(level1Products.map((p: any) => [p.id, p]))

          return await persistAndReturn(
            {
              ...aiResult,
              referenced_internal_products: cards.map((p: any) => p.id),
              referenced_product_data: cards.map((p: any) => {
                const fullProduct = productLookup.get(p.id) || p
                return {
                  id: fullProduct.id,
                  name: fullProduct.name,
                  image_url: fullProduct.image_url?.includes('bhphotovideo')
                    ? `${IMAGE_PROXY_URL}?url=${encodeURIComponent(fullProduct.image_url)}`
                    : fullProduct.image_url || '',
                  price_usd: fullProduct.price_usd,
                  price_brl: fullProduct.price_brl,
                }
              }),
              ai_referenced_count: cards.length,
              full_search_results: cards.length || level1Products.length,
            },
            'products',
          )
        } else {
          // ═══ MODO NORMAL ═══

          let enrichedQuery = applyCustomStopWords(
            isHPMode ? cleanPortugueseGenericWords(query) : query,
            customStopWords,
          )
          console.log(
            `[enriched-query] original="${query}" cleaned="${isHPMode ? cleanPortugueseGenericWords(query) : query}" afterStopWords="${enrichedQuery}" mode=${isHPMode ? 'HP' : 'PP'}`,
          )
          if (currentProductContext?.name) {
            // SE for query comparativa, NÃO adiciona manufacturer do produto atual
            const lowerQuery = query.toLowerCase()
            const isComparisonQuery =
              /^(compare|comparar|vs|versus|x)\b|(\b(compare|comparar|vs|versus|x|ou)\b)/i.test(
                lowerQuery,
              )

            if (isComparisonQuery) {
              console.log(
                `[enriched-query] comparison query detected, skipping manufacturer injection`,
              )
            } else {
              const manufacturer = currentProductContext.name.split(' ')[0]
              enrichedQuery = applyCustomStopWords(
                `${isHPMode ? cleanPortugueseGenericWords(query) : query} ${manufacturer}`,
                customStopWords,
              )
              console.log(
                `[enriched-query] manufacturer="${manufacturer}" final="${enrichedQuery}"`,
              )
            }
          }

          console.log('[enriched] calling execute_ai_search_v3 with search_term:', enrichedQuery)

          const result = await supabase.rpc('execute_ai_search_v3', {
            search_term: enrichedQuery,
          })
          const rpcResults = result.data?.stock || []
          const rpcError = result.error

          console.log(
            '[enriched] rpc returned:',
            rpcResults.length,
            'products | ids:',
            rpcResults.map((p) => p.id).join(','),
          )
          console.log('[enriched] rpc error:', rpcError)

          if (!rpcError && rpcResults && Array.isArray(rpcResults) && rpcResults.length > 0) {
            const orderedIds: string[] = rpcResults.map((p: any) => p.id)
            const { data: fullProducts, error: fetchError } = await supabase
              .from('products')
              .select(
                'id, name, sku, category, description, technical_info, image_url, price_usd, price_brl, price_nationalized_sales, price_nationalized_currency, price_usa_rebate, weight, is_discontinued, manufacturer_id, manufacturers(name)',
              )
              .in('id', orderedIds)

            console.log(
              '[DEBUG] fullProducts sample:',
              JSON.stringify(
                fullProducts?.slice(0, 3).map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  manufacturer_id: p.manufacturer_id,
                  manufacturers: p.manufacturers,
                  manufacturer_mapped: p.manufacturers?.name || p.manufacturer || null,
                })),
              ),
            )

            if (!fetchError && fullProducts) {
              const productMap = new Map(fullProducts.map((p: any) => [p.id, p]))
              level1Products = orderedIds
                .map((id: string) => productMap.get(id))
                .filter((p: any) => p !== undefined)
            }
          }

          // ═══ FILTRO DE INTENÇÃO usando stop_words do banco ═══
          const queryForFilter = (enrichedQuery || query || '').toLowerCase()
          const rawTokens = queryForFilter.split(' ').filter((t) => t.length > 2)
          const { data: stopWordsData } = await supabase.from('stop_words').select('word')
          const stopWordsSet = new Set(
            (stopWordsData || []).map((sw: any) => sw.word.toLowerCase()),
          )
          const intentTokens = rawTokens.filter((t) => !stopWordsSet.has(t))
          if (intentTokens.length > 0) {
            const before = level1Products.length
            const filtered = level1Products.filter((p: any) => {
              const name = (p.name || p.nome || '').toLowerCase()
              return intentTokens.some((token: string) => name.includes(token))
            })
            if (filtered.length >= 3) {
              level1Products = filtered
              console.log(
                `[curation] Intent filter applied tokens=[${intentTokens.join(',')}] before=${before} after=${filtered.length}`,
              )
            } else {
              console.log(
                `[curation] Intent filter removed too many (${filtered.length}/${before}), keeping original set`,
              )
            }
          } else {
            console.log('[curation] No intent tokens found, skipping filter')
          }

          // ═══ Curadoria com diversidade de fabricantes ═══
          const MAX_PER_MANUFACTURER = 2
          const MAX_TOTAL_CARDS = 10
          const productsByManufacturer = new Map()
          for (const product of level1Products) {
            const manufacturer = (
              product.manufacturers?.name ||
              product.manufacturer ||
              product.brand ||
              'Outros'
            ).trim()
            if (!productsByManufacturer.has(manufacturer)) {
              productsByManufacturer.set(manufacturer, [])
            }
            productsByManufacturer.get(manufacturer).push(product)
          }
          const manufacturerEntries = Array.from(productsByManufacturer.entries())
          manufacturerEntries.sort((a, b) => b[1].length - a[1].length)
          const balancedProducts: any[] = []
          let index = 0
          let allExhausted = false
          while (balancedProducts.length < MAX_TOTAL_CARDS && !allExhausted) {
            allExhausted = true
            for (const [mfr, products] of manufacturerEntries) {
              if (index < products.length && balancedProducts.length < MAX_TOTAL_CARDS) {
                const countForBrand = balancedProducts.filter(
                  (p) => (p.manufacturer || p.brand || 'Outros').trim() === mfr,
                ).length
                if (countForBrand < MAX_PER_MANUFACTURER) {
                  balancedProducts.push(products[index])
                  allExhausted = false
                }
              }
            }
            index++
          }
          featured = balancedProducts
          cards = balancedProducts
          console.log(
            `[curation] total=${level1Products.length} balanced=${balancedProducts.length} manufacturers=[${manufacturerEntries.map(([m, p]) => `${m}(${p.length})`).join(', ')}]`,
          )

          // ═══ Gerar resposta e retornar ═══
          contextForAI = {
            agentSettings,
            aiSettings,
            products: featured,
            manufacturerList,
            history,
            currentProductId: lastReferencedProductId,
            contextualProductData,
            productPagePrompt: productPagePrompt || undefined,
            currentProductContext: currentProductContext || undefined,
            imageProxyUrl: IMAGE_PROXY_URL, // ← ADICIONE AQUI
          }

          aiResult = await generateResponse(query, contextForAI, undefined, supabase)
          return await persistAndReturn(
            {
              ...aiResult,
              referenced_internal_products: cards.map((p: any) => p.id),
              referenced_product_data: cards.map((p: any) => {
                const rawUrl = p.image_url || p.thumbnail_url || p.image || ''
                return {
                  id: p.id,
                  name: p.name,
                  // URLs da B&H passam pelo proxy para evitar hotlinking; demais URLs vão direto
                  image_url:
                    rawUrl.includes('bhphotovideo') || rawUrl.includes('bhphoto')
                      ? IMAGE_PROXY_URL + '?url=' + encodeURIComponent(rawUrl)
                      : rawUrl,
                  price_usd: p.price_usd,
                  price_brl: p.price_brl,
                }
              }),
              ai_referenced_count: cards.length,
              full_search_results: cards.length || level1Products.length,
            },
            'products',
          )
        }

        // ATENÇÃO: código abaixo não executa (ambos os branches do if/else têm return)
        // Mantido para referência — pode ser removido em refatoração futura

        // Contexto para IA — usa featured (que em modo comparação = comparisonResults)
        contextForAI = {
          agentSettings,
          aiSettings,
          products: featured,
          manufacturerList,
          history,
          currentProductId: lastReferencedProductId,
          contextualProductData,
          productPagePrompt: productPagePrompt || undefined,
          currentProductContext: currentProductContext || undefined,
          imageProxyUrl: IMAGE_PROXY_URL, // ← ADICIONE AQUI
        }

        console.log(
          `[price-check] Stage C final: level1=${level1Products.length} featured=${featured.length} cards=${cards.length}`,
        )
      } catch (err) {
        console.error('[cascata] Stage C error:', err)
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

      // full_search_results para cards: usa level1Products (ou cards) em vez do searchPromise
      const fullSearchResults = cards || level1Products || []

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

    interface ProductItem {
      id: string
      name: string
      manufacturer?: string
      category?: string
      price?: number
      variant?: string
    }

    function curateProducts(
      products: ProductItem[],
      intent: string,
      searchTerms: string[],
      query: string,
    ): { featured: ProductItem[]; cards: ProductItem[] } {
      if (!products || products.length === 0) {
        return { featured: [], cards: [] }
      }

      // ── Caso 1: COMPARAÇÃO ──
      if (intent === 'comparison' && searchTerms.length > 0) {
        const terms = searchTerms.map((t) => t.toLowerCase())
        const matched = products.filter((p) => {
          const name = (p.name || '').toLowerCase()
          const sku = (p.sku || '').toLowerCase()
          const manufacturer = (p.manufacturer || '').toLowerCase()
          const searchText = `${name} ${sku} ${manufacturer}`
          return terms.some((t) => searchText.includes(t))
        })
        if (matched.length > 0) {
          return { featured: matched, cards: matched }
        }
        return { featured: products.slice(0, 6), cards: products }
      }

      // ── Caso 2: ACESSÓRIO ──
      if (intent === 'accessory') {
        return { featured: products.slice(0, 4), cards: products }
      }

      // ── Caso 3: CATÁLOGO/GENÉRICA (ex: "câmera PTZ 4K") ──
      const featuredMap = new Map<string, ProductItem[]>()
      for (const p of products) {
        const mfr = p.manufacturer || 'Outros'
        if (!featuredMap.has(mfr)) featuredMap.set(mfr, [])
        if (featuredMap.get(mfr)!.length < 2) {
          featuredMap.get(mfr)!.push(p)
        }
      }
      const featured = Array.from(featuredMap.values()).flat()

      return { featured, cards: products }
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
