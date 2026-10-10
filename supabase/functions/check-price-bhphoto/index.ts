import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

interface PriceCheckRequest {
  product_id?: string
  source?: 'manual' | 'batch'
  manual_url?: string
}

interface ScrapedData {
  price?: number | string | null
  price_regular?: number | string | null
  rebate_active?: boolean | string | null
  rebate_savings?: number | string | null
  rebate_end_date?: string | null
  is_discontinued?: boolean | string | null
  availability?: string | null
  sku?: string | null
  mfr_number?: string | null
  name?: string | null
}

function normalizeSku(sku: string | null | undefined): string {
  if (!sku) return ''
  return String(sku)
    .toUpperCase()
    .replace(/^MFR\s*#\s*/i, '')
    .replace(/[^A-Z0-9]/g, '')
}

function parsePrice(raw: any): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') {
    return isNaN(raw) || raw <= 0 ? null : raw
  }
  const clean = String(raw).replace(/[^0-9.]/g, '')
  if (!clean) return null
  const num = parseFloat(clean)
  return isNaN(num) || num <= 0 ? null : num
}

function isDiscontinuedValue(val: any, availability?: any): boolean {
  if (val === true || String(val).toLowerCase() === 'true') return true
  const availText = String(availability || '').toLowerCase()
  if (
    availText.includes('discontinued') ||
    availText.includes('descontinuado') ||
    availText.includes('no longer available')
  ) {
    return true
  }
  return false
}

async function scrapeBhUrl(
  url: string,
  firecrawlToken: string,
): Promise<{ success: boolean; data?: ScrapedData; error?: string }> {
  const firecrawlUrl = 'https://api.firecrawl.dev/v2/scrape'

  const res = await fetch(firecrawlUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firecrawlToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: [
        {
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              price: {
                type: 'string',
                description:
                  'Current final selling price in USD, taking into account any instant savings or featured rebate. Only numbers and dot.',
              },
              price_regular: {
                type: 'string',
                description:
                  'Original regular/list/strikethrough price in USD before instant savings or rebate, if discounted. Empty/null if no discount/rebate.',
              },
              rebate_active: {
                type: 'boolean',
                description:
                  'True if an instant savings, manufacturer rebate or promotional discount is currently active on the page.',
              },
              rebate_savings: {
                type: 'string',
                description:
                  'Instant savings or rebate amount in USD (e.g. 100.00). Only numbers and dot.',
              },
              rebate_end_date: {
                type: 'string',
                description:
                  'Promotion or instant savings expiration/validity raw text or date if explicitly stated (e.g. "Offer ends Oct 11 at 11:59 PM ET", "Ends Apr 15", "Valid thru 10/11/2025").',
              },
              is_discontinued: {
                type: 'boolean',
                description:
                  'True if the product is marked as discontinued by manufacturer or no longer available.',
              },
              availability: {
                type: 'string',
                description:
                  'Product availability description, e.g. In Stock, Discontinued, Special Order, Backordered.',
              },
              sku: {
                type: 'string',
                description: 'B&H internal SKU or catalog item number.',
              },
              mfr_number: {
                type: 'string',
                description: "Manufacturer Part Number or MFR # code from the product's specs.",
              },
              name: {
                type: 'string',
                description: 'Product title as displayed on page.',
              },
            },
            required: ['price'],
          },
          prompt:
            'Extract the current USD final selling price, the regular/strikethrough price if any, whether instant savings/rebate is active, rebate savings amount and the exact expiration date / deadline text (e.g. "Offer ends Oct 11 at 11:59 PM ET") if present, whether the product is discontinued by manufacturer, the availability status text, and the Manufacturer Part Number / MFR # code (plus internal SKU).',
        },
      ],
      onlyMainContent: true,
    }),
  })

  if (res.status === 429) {
    return {
      success: false,
      error: 'Limite de requisições do Firecrawl atingido. Tente em instantes.',
    }
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[check-price-bhphoto] Firecrawl scrape HTTP ${res.status}: ${errText}`)
    return { success: false, error: `Falha na raspagem da página B&H (${res.status}).` }
  }

  const json = await res.json()
  if (!json.success || !json.data) {
    return { success: false, error: 'Não foi possível extrair dados da página B&H.' }
  }

  const extracted = (json.data.json || json.data) as ScrapedData
  return { success: true, data: extracted }
}

async function searchBhUrls(
  query: string,
  firecrawlToken: string,
): Promise<{ success: boolean; urls: string[]; error?: string }> {
  const searchEndpoint = 'https://api.firecrawl.dev/v2/search'

  const res = await fetch(searchEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firecrawlToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      includeDomains: ['bhphotovideo.com'],
      limit: 5,
    }),
  })

  if (res.status === 429) {
    return {
      success: false,
      urls: [],
      error: 'Limite de requisições atingido na busca do Firecrawl.',
    }
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[check-price-bhphoto] Firecrawl search HTTP ${res.status}: ${errText}`)
    return { success: false, urls: [], error: `Falha na busca Firecrawl (${res.status}).` }
  }

  const json = await res.json()
  const urls: string[] = []

  // Firecrawl v2 search response may have results in json.data.web or json.data as an array
  if (json.data) {
    if (Array.isArray(json.data.web)) {
      for (const item of json.data.web) {
        if (item?.url && typeof item.url === 'string') {
          urls.push(item.url)
        }
      }
    } else if (Array.isArray(json.data)) {
      for (const item of json.data) {
        if (item?.url && typeof item.url === 'string') {
          urls.push(item.url)
        }
      }
    }
  }

  // Filter only product pages on B&H (/c/product/)
  const filtered = urls.filter((u) => {
    try {
      const parsed = new URL(u)
      return (
        parsed.hostname.includes('bhphotovideo.com') &&
        (parsed.pathname.includes('/c/product/') || parsed.pathname.includes('/product/'))
      )
    } catch {
      return false
    }
  })

  return { success: true, urls: filtered.length > 0 ? filtered : urls }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const firecrawlToken = Deno.env.get('FIRECRAWL_API_KEY') || ''

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Configuração interna do Supabase ausente.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!firecrawlToken) {
    return new Response(
      JSON.stringify({ error: 'Chave de API do Firecrawl não configurada (FIRECRAWL_API_KEY).' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let body: PriceCheckRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido no corpo da requisição.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { product_id, source = 'manual', manual_url } = body

  if (!product_id || typeof product_id !== 'string') {
    return new Response(JSON.stringify({ error: 'product_id é obrigatório.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 1. Buscar produto no banco com fabricante
  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select(
      'id, name, sku, price_usd, website_url, is_discontinued, manufacturer:manufacturers(id, name)',
    )
    .eq('id', product_id)
    .maybeSingle()

  if (prodErr || !product) {
    console.error(`[check-price-bhphoto] Product not found: ${product_id}`, prodErr)
    return new Response(JSON.stringify({ error: 'Produto não encontrado.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const manufacturerName =
    (product.manufacturer as any)?.name ||
    (typeof (product as any).manufacturer === 'string' ? (product as any).manufacturer : '') ||
    ''

  const targetSku = (product.sku || '').trim()
  const normalizedTargetSku = normalizeSku(targetSku)

  // URL a usar: manual_url explicitamente enviada (validação de link manual) OU website_url cadastrado
  const cleanManualUrl = manual_url && typeof manual_url === 'string' ? manual_url.trim() : null
  let finalUrl: string | null =
    cleanManualUrl || (product.website_url ? String(product.website_url).trim() : null)
  let urlDiscovered = false
  let scrapedResult: ScrapedData | null = null

  // Helper para salvar no histórico de checagens
  const recordCheck = async (payload: {
    status: 'ok' | 'divergente' | 'descontinuado' | 'sem_url_confirmada' | 'erro'
    price_db: number | null
    price_bh: number | null
    diff_usd: number | null
    diff_pct: number | null
    url_used: string | null
    url_discovered: boolean
    message: string
    raw?: any
  }) => {
    try {
      const { error: insertErr } = await supabase.from('price_checks').insert({
        product_id: product.id,
        checked_at: new Date().toISOString(),
        price_db: payload.price_db,
        price_bh: payload.price_bh,
        diff_usd: payload.diff_usd,
        diff_pct: payload.diff_pct,
        status: payload.status,
        source,
        url_used: payload.url_used,
        url_discovered: payload.url_discovered,
        message: payload.message,
        raw: payload.raw || null,
      })
      if (insertErr) {
        console.error('[check-price-bhphoto] Error recording price check:', insertErr)
      }
    } catch (recErr) {
      console.error('[check-price-bhphoto] Exception recording price check:', recErr)
    }
  }

  try {
    // Se foi fornecida manual_url para validação (análise manual de link para produto sem link ou duvidoso)
    if (cleanManualUrl && cleanManualUrl.startsWith('http')) {
      console.log(`[check-price-bhphoto] Analisando URL informada manualmente: ${cleanManualUrl}`)
      const scrapeRes = await scrapeBhUrl(cleanManualUrl, firecrawlToken)
      if (!scrapeRes.success || !scrapeRes.data) {
        const errorMsg = scrapeRes.error || 'Falha ao raspar a URL informada da B&H.'
        await recordCheck({
          status: 'erro',
          price_db: product.price_usd != null ? Number(product.price_usd) : null,
          price_bh: null,
          diff_usd: null,
          diff_pct: null,
          url_used: cleanManualUrl,
          url_discovered: false,
          message: errorMsg,
        })
        return new Response(
          JSON.stringify({
            status: 'erro',
            message: errorMsg,
            url_used: cleanManualUrl,
            url_discovered: false,
            sku_matched: false,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const candData = scrapeRes.data
      const candMfrSku = normalizeSku(candData.mfr_number)
      const candBhSku = normalizeSku(candData.sku)

      const matchesSku =
        !normalizedTargetSku ||
        (candMfrSku && candMfrSku === normalizedTargetSku) ||
        (candBhSku && candBhSku === normalizedTargetSku) ||
        (candMfrSku && candMfrSku.includes(normalizedTargetSku)) ||
        (normalizedTargetSku && candMfrSku && normalizedTargetSku.includes(candMfrSku))

      if (!matchesSku) {
        const mismatchMsg = `MFR # da B&H ("${candData.mfr_number || candData.sku || 'não identificado'}") não confere com o SKU cadastrado ("${targetSku}"). Link considerado duvidoso.`
        await recordCheck({
          status: 'sem_url_confirmada',
          price_db: product.price_usd != null ? Number(product.price_usd) : null,
          price_bh: null,
          diff_usd: null,
          diff_pct: null,
          url_used: cleanManualUrl,
          url_discovered: false,
          message: mismatchMsg,
          raw: candData,
        })
        return new Response(
          JSON.stringify({
            status: 'sem_url_confirmada',
            message: mismatchMsg,
            url_used: cleanManualUrl,
            url_discovered: false,
            sku_matched: false,
            mfr_number_found: candData.mfr_number || candData.sku || null,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // MFR # validado com sucesso! Gravar website_url no banco de dados (conforme item 4)
      console.log(
        `[check-price-bhphoto] MFR # conferido com sucesso para ${cleanManualUrl}. Gravando website_url no produto ${product.id}`,
      )
      const nowIso = new Date().toISOString()
      const { error: updateUrlErr } = await supabase
        .from('products')
        .update({
          website_url: cleanManualUrl,
          updated_at: nowIso,
          last_reviewed_at: nowIso,
        })
        .eq('id', product.id)

      if (updateUrlErr) {
        console.warn('[check-price-bhphoto] Falha ao gravar website_url validada:', updateUrlErr)
      }

      finalUrl = cleanManualUrl
      urlDiscovered = true
      scrapedResult = candData
    } else if (finalUrl && finalUrl.startsWith('http')) {
      // CAMINHO A: Produto TEM website_url
      console.log(`[check-price-bhphoto] Caminho A: raspando URL cadastrada: ${finalUrl}`)
      const scrapeRes = await scrapeBhUrl(finalUrl, firecrawlToken)
      if (!scrapeRes.success || !scrapeRes.data) {
        const errorMsg = scrapeRes.error || 'Falha ao raspar a URL cadastrada na B&H.'
        await recordCheck({
          status: 'erro',
          price_db: product.price_usd != null ? Number(product.price_usd) : null,
          price_bh: null,
          diff_usd: null,
          diff_pct: null,
          url_used: finalUrl,
          url_discovered: false,
          message: errorMsg,
        })
        return new Response(
          JSON.stringify({
            status: 'erro',
            message: errorMsg,
            url_used: finalUrl,
            url_discovered: false,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      scrapedResult = scrapeRes.data
    } else {
      // CAMINHO B: Produto SEM website_url -> buscar por Fabricante + SKU
      console.log(`[check-price-bhphoto] Caminho B: produto sem URL, iniciando busca...`)
      if (!targetSku) {
        const msg =
          'Produto sem SKU cadastrado e sem URL da B&H. Preencha o SKU ou a URL para verificar.'
        await recordCheck({
          status: 'sem_url_confirmada',
          price_db: product.price_usd != null ? Number(product.price_usd) : null,
          price_bh: null,
          diff_usd: null,
          diff_pct: null,
          url_used: null,
          url_discovered: false,
          message: msg,
        })
        return new Response(
          JSON.stringify({
            status: 'sem_url_confirmada',
            message: msg,
            url_used: null,
            url_discovered: false,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const searchQuery = `${manufacturerName} ${targetSku}`.trim()
      console.log(`[check-price-bhphoto] Executando busca: "${searchQuery}"`)
      const searchRes = await searchBhUrls(searchQuery, firecrawlToken)

      if (!searchRes.success || searchRes.urls.length === 0) {
        const msg = `Nenhum resultado encontrado na B&H para "${searchQuery}". Revise a URL manualmente.`
        await recordCheck({
          status: 'sem_url_confirmada',
          price_db: product.price_usd != null ? Number(product.price_usd) : null,
          price_bh: null,
          diff_usd: null,
          diff_pct: null,
          url_used: null,
          url_discovered: false,
          message: msg,
        })
        return new Response(
          JSON.stringify({
            status: 'sem_url_confirmada',
            message: msg,
            url_used: null,
            url_discovered: false,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Tenta os resultados ranqueados (até 3 candidatos) procurando confirmação estrita de SKU
      let candidateMatch: { url: string; data: ScrapedData } | null = null
      const candidatesToTest = searchRes.urls.slice(0, 3)

      for (const candidateUrl of candidatesToTest) {
        console.log(`[check-price-bhphoto] Testando candidato: ${candidateUrl}`)
        const scrapeCand = await scrapeBhUrl(candidateUrl, firecrawlToken)
        if (!scrapeCand.success || !scrapeCand.data) continue

        const candData = scrapeCand.data
        const candMfrSku = normalizeSku(candData.mfr_number)
        const candBhSku = normalizeSku(candData.sku)

        // Comparação normalizada: case-insensitive, sem pontuação, traços ou espaços
        const matchesSku =
          (candMfrSku && candMfrSku === normalizedTargetSku) ||
          (candBhSku && candBhSku === normalizedTargetSku) ||
          (candMfrSku && candMfrSku.includes(normalizedTargetSku)) ||
          (normalizedTargetSku && candMfrSku && normalizedTargetSku.includes(candMfrSku))

        if (matchesSku) {
          console.log(
            `[check-price-bhphoto] SKU confirmado com sucesso! Cadastro: "${normalizedTargetSku}", B&H MFR: "${candMfrSku}", B&H SKU: "${candBhSku}"`,
          )
          candidateMatch = { url: candidateUrl, data: candData }
          break
        } else {
          console.log(
            `[check-price-bhphoto] SKU não confere para ${candidateUrl}: alvo="${normalizedTargetSku}", mfr="${candMfrSku}", sku="${candBhSku}"`,
          )
        }
      }

      if (!candidateMatch) {
        const msg = `Encontradas páginas na B&H para "${searchQuery}", mas o SKU não pôde ser confirmado com precisão. Revise a URL manualmente.`
        await recordCheck({
          status: 'sem_url_confirmada',
          price_db: product.price_usd != null ? Number(product.price_usd) : null,
          price_bh: null,
          diff_usd: null,
          diff_pct: null,
          url_used: searchRes.urls[0] || null,
          url_discovered: false,
          message: msg,
          raw: { candidates: searchRes.urls },
        })
        return new Response(
          JSON.stringify({
            status: 'sem_url_confirmada',
            message: msg,
            url_used: searchRes.urls[0] || null,
            url_discovered: false,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // SKU confirmado: adotar URL e gravar em products.website_url
      finalUrl = candidateMatch.url
      urlDiscovered = true
      scrapedResult = candidateMatch.data

      console.log(`[check-price-bhphoto] Gravando website_url confirmada no banco: ${finalUrl}`)
      const { error: updateUrlErr } = await supabase
        .from('products')
        .update({ website_url: finalUrl })
        .eq('id', product.id)

      if (updateUrlErr) {
        console.warn('[check-price-bhphoto] Falha ao gravar website_url:', updateUrlErr)
      }
    }

    // Processamento do resultado raspado
    const priceDb = product.price_usd != null ? Number(product.price_usd) : null
    const priceBh = parsePrice(scrapedResult.price)
    const priceRegular = parsePrice(scrapedResult.price_regular)
    const rebateSavings = parsePrice(scrapedResult.rebate_savings)
    const rebateActive =
      scrapedResult.rebate_active === true ||
      String(scrapedResult.rebate_active).toLowerCase() === 'true' ||
      Boolean(priceRegular && priceBh && priceRegular > priceBh) ||
      Boolean(rebateSavings && rebateSavings > 0)
    const rebateEndDate = scrapedResult.rebate_end_date
      ? String(scrapedResult.rebate_end_date).trim()
      : null
    let rebateEndDateIso: string | null = null

    // Tentar normalizar data ISO se identificável
    if (rebateEndDate) {
      // Padrões comuns B&H: "Offer ends Oct 11 at 11:59 PM ET", "Ends Apr 15", "10/11/2025"
      try {
        // Remover "Offer ends", "Ends", "at ... ET" para tentativa de parse
        const cleanedDateStr = rebateEndDate
          .replace(/^(offer\s+ends|ends|valid\s+thru|expires)\s*:?/i, '')
          .replace(/at\s+\d{1,2}(:\d{2})?\s*(am|pm)?\s*(et|est|edt)?/i, '')
          .trim()
        const parsedTimestamp = Date.parse(cleanedDateStr)
        if (!isNaN(parsedTimestamp)) {
          const d = new Date(parsedTimestamp)
          // Se ano veio padrão (ano corrente ou próximo), converte para ISO
          rebateEndDateIso = d.toISOString()
        }
      } catch {
        rebateEndDateIso = null
      }
    }

    // Preço cheio original (se houver rebate) e preço final
    const priceFull =
      rebateActive && priceRegular && priceRegular > (priceBh || 0)
        ? priceRegular
        : rebateActive && priceBh && rebateSavings
          ? Number((priceBh + rebateSavings).toFixed(2))
          : priceRegular || priceBh
    const priceWithRebate = rebateActive ? priceBh : null

    // Verificar se existe regra de rebate cadastrada no banco de dados para pareamento
    let activeCatalogRebateRule: any = null
    try {
      const nowIso = new Date().toISOString()
      const { data: rebateRules } = await supabase
        .from('discounts')
        .select(
          'id, name, discount_type, discount_value, start_date, end_date, is_active, product_selection',
        )
        .eq('name', 'Rebate Fabricante')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (rebateRules && Array.isArray(rebateRules)) {
        const found = rebateRules.find((r: any) => {
          if (!r.product_selection) return false
          const matches =
            Array.isArray(r.product_selection) && r.product_selection.includes(product.id)
          if (!matches) return false
          if (r.start_date && new Date(r.start_date) > new Date(nowIso)) return false
          if (r.end_date && new Date(r.end_date) < new Date(nowIso)) return false
          return true
        })
        if (found) {
          activeCatalogRebateRule = found
        }
      }
    } catch (ruleErr) {
      console.warn(
        '[check-price-bhphoto] Erro ao consultar regra Rebate Fabricante no edge:',
        ruleErr,
      )
    }

    const calcDiscountedPrice = (orig: number, type: string, val: number): number => {
      if (val <= 0) return orig
      if (type === 'price_usa_percentage' || type === 'percentage') {
        return orig * (1 - val / 100)
      }
      if (type === 'fixed' || type === 'fixed_amount') {
        return Math.max(0, orig - val)
      }
      return orig
    }

    const isDiscontinued = isDiscontinuedValue(
      scrapedResult.is_discontinued,
      scrapedResult.availability,
    )

    // Se estiver descontinuado pelo fabricante na B&H
    if (isDiscontinued) {
      const msg = 'Produto descontinuado pelo fabricante na B&H.'
      await recordCheck({
        status: 'descontinuado',
        price_db: priceDb,
        price_bh: priceBh,
        diff_usd:
          priceDb != null && priceBh != null ? Number((priceBh - priceDb).toFixed(2)) : null,
        diff_pct:
          priceDb != null && priceDb > 0 && priceBh != null
            ? Number((((priceBh - priceDb) / priceDb) * 100).toFixed(2))
            : null,
        url_used: finalUrl,
        url_discovered: urlDiscovered,
        message: msg,
        raw: scrapedResult,
      })

      return new Response(
        JSON.stringify({
          status: 'descontinuado',
          price_usd_cadastrado: priceDb,
          price_bh: priceBh,
          diff_usd:
            priceDb != null && priceBh != null ? Number((priceBh - priceDb).toFixed(2)) : null,
          diff_pct:
            priceDb != null && priceDb > 0 && priceBh != null
              ? Number((((priceBh - priceDb) / priceDb) * 100).toFixed(2))
              : null,
          is_discontinued: true,
          url_used: finalUrl,
          url_discovered: urlDiscovered,
          message: msg,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (priceBh == null) {
      const msg = 'Preço não encontrado na página da B&H. Verifique se o item está disponível.'
      await recordCheck({
        status: 'erro',
        price_db: priceDb,
        price_bh: null,
        diff_usd: null,
        diff_pct: null,
        url_used: finalUrl,
        url_discovered: urlDiscovered,
        message: msg,
        raw: scrapedResult,
      })

      return new Response(
        JSON.stringify({
          status: 'erro',
          price_usd_cadastrado: priceDb,
          price_bh: null,
          url_used: finalUrl,
          url_discovered: urlDiscovered,
          message: msg,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Se o produto não tinha preço cadastrado (price_usd é null ou 0), qualquer preço B&H é divergente
    if (priceDb == null || priceDb === 0) {
      const msg = `Preço B&H identificado: US$ ${priceBh.toFixed(2)}. Produto não possuía preço cadastrado.`
      await recordCheck({
        status: 'divergente',
        price_db: priceDb,
        price_bh: priceBh,
        diff_usd: priceBh,
        diff_pct: 100,
        url_used: finalUrl,
        url_discovered: urlDiscovered,
        message: msg,
        raw: scrapedResult,
      })

      return new Response(
        JSON.stringify({
          status: 'divergente',
          price_usd_cadastrado: priceDb,
          price_bh: priceBh,
          diff_usd: priceBh,
          diff_pct: 100,
          url_used: finalUrl,
          url_discovered: urlDiscovered,
          message: msg,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Cálculo da divergência e status (com suporte a pareamento de rebate)
    let status: 'ok' | 'divergente' = 'divergente'
    let msg = ''
    let diffUsd = Number((priceBh - priceDb).toFixed(2))
    let diffPct = Number((((priceBh - priceDb) / priceDb) * 100).toFixed(2))

    // Se temos rebate vigente em ambos os lados: pareia Cheio × Cheio e Desconto × Desconto
    if (activeCatalogRebateRule && rebateActive && (priceWithRebate != null || priceBh != null)) {
      const catalogDiscounted = Number(
        calcDiscountedPrice(
          priceDb,
          String(activeCatalogRebateRule.discount_type),
          Number(activeCatalogRebateRule.discount_value),
        ).toFixed(2),
      )
      const bhTargetRebate = priceWithRebate ?? priceBh!
      const bhTargetFull = priceFull && priceFull > bhTargetRebate ? priceFull : null

      const evalTolerance = (baseVal: number, targetVal: number) => {
        const dUsd = Number((targetVal - baseVal).toFixed(2))
        const aDUsd = Math.abs(dUsd)
        const dPct =
          baseVal > 0 ? Number((((targetVal - baseVal) / baseVal) * 100).toFixed(2)) : 100
        const aDPct = Math.abs(dPct)
        const tolUsd = Math.max(1.0, baseVal * 0.01)
        return {
          within: aDUsd <= tolUsd || aDPct <= 1.0,
          diffUsd: dUsd,
          diffPct: dPct,
        }
      }

      const rebatePairEval = evalTolerance(catalogDiscounted, bhTargetRebate)
      let fullPairEval: { within: boolean; diffUsd: number; diffPct: number } | null = null
      if (bhTargetFull != null) {
        fullPairEval = evalTolerance(priceDb, bhTargetFull)
      }

      const isBothOk = fullPairEval
        ? fullPairEval.within && rebatePairEval.within
        : rebatePairEval.within
      status = isBothOk ? 'ok' : 'divergente'

      diffUsd = rebatePairEval.diffUsd
      diffPct = rebatePairEval.diffPct

      if (isBothOk) {
        msg = fullPairEval
          ? `Preços conferidos com a B&H em ambos os pares: Cheio (US$ ${priceDb.toFixed(2)} × US$ ${bhTargetFull?.toFixed(2)}) e Rebate (US$ ${catalogDiscounted.toFixed(2)} × US$ ${bhTargetRebate.toFixed(2)}).`
          : `Preço com rebate conferido com a B&H: US$ ${catalogDiscounted.toFixed(2)} × US$ ${bhTargetRebate.toFixed(2)} dentro da tolerância.`
      } else {
        const issues: string[] = []
        if (fullPairEval && !fullPairEval.within) {
          issues.push(
            `Preço cheio diverge: Cadastrado US$ ${priceDb.toFixed(2)} × B&H US$ ${bhTargetFull?.toFixed(2)} (dif: ${fullPairEval.diffUsd > 0 ? '+' : ''}${fullPairEval.diffUsd.toFixed(2)})`,
          )
        }
        if (!rebatePairEval.within) {
          issues.push(
            `Preço com rebate diverge: Cadastrado US$ ${catalogDiscounted.toFixed(2)} × B&H US$ ${bhTargetRebate.toFixed(2)} (dif: ${rebatePairEval.diffUsd > 0 ? '+' : ''}${rebatePairEval.diffUsd.toFixed(2)})`,
          )
        }
        msg = issues.join(' · ')
      }
    } else {
      // Comparação simples atual
      const absDiffUsd = Math.abs(diffUsd)
      const absDiffPct = Math.abs(diffPct)
      const toleranceUsd = Math.max(1.0, priceDb * 0.01)
      const isWithinTolerance = absDiffUsd <= toleranceUsd || absDiffPct <= 1.0

      status = isWithinTolerance ? 'ok' : 'divergente'
      msg = isWithinTolerance
        ? `Preço conferido com a B&H. Variação de US$ ${diffUsd.toFixed(2)} (${diffPct.toFixed(2)}%) dentro da tolerância acordada.`
        : `Preço divergente da B&H. Diferença de US$ ${diffUsd > 0 ? '+' : ''}${diffUsd.toFixed(2)} (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(2)}%).`
    }

    if (rebateActive) {
      msg += ` [Rebate/Instant Savings ativo na B&H: Preço com desconto US$ ${priceWithRebate?.toFixed(2)} / Preço cheio US$ ${priceFull?.toFixed(2)}${rebateEndDate ? ` - Vigência: ${rebateEndDate}` : ''}]`
    }

    await recordCheck({
      status,
      price_db: priceDb,
      price_bh: priceBh,
      diff_usd: diffUsd,
      diff_pct: diffPct,
      url_used: finalUrl,
      url_discovered: urlDiscovered,
      message: msg,
      raw: {
        ...scrapedResult,
        rebate_info: {
          rebate_active: rebateActive,
          price_full: priceFull,
          price_with_rebate: priceWithRebate,
          rebate_savings: rebateSavings,
          rebate_end_date: rebateEndDate,
        },
      },
    })

    return new Response(
      JSON.stringify({
        status,
        price_usd_cadastrado: priceDb,
        price_bh: priceBh,
        diff_usd: diffUsd,
        diff_pct: diffPct,
        url_used: finalUrl,
        url_discovered: urlDiscovered,
        message: msg,
        rebate_active: rebateActive,
        price_full: priceFull,
        price_with_rebate: priceWithRebate,
        rebate_savings: rebateSavings,
        rebate_end_date: rebateEndDate,
        rebate_end_date_iso: rebateEndDateIso,
        sku_matched: true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[check-price-bhphoto] Erro inesperado:', err)
    const msg = `Erro inesperado durante a verificação de preço: ${err?.message || 'Falha desconhecida'}`
    await recordCheck({
      status: 'erro',
      price_db: product.price_usd != null ? Number(product.price_usd) : null,
      price_bh: null,
      diff_usd: null,
      diff_pct: null,
      url_used: finalUrl,
      url_discovered: urlDiscovered,
      message: msg,
    })
    return new Response(
      JSON.stringify({
        status: 'erro',
        message: msg,
        url_used: finalUrl,
        url_discovered: urlDiscovered,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
