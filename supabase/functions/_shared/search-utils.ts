export function sanitizeInput(input: string): string {
  return input.slice(0, 2000).trim()
}

export function isInstitutionalQuery(query: string): boolean {
  const institutionalKeywords = [
    'empresa',
    'sobre',
    'contato',
    'endereço',
    'telefone',
    'email',
    'horário',
    'funcionamento',
    'política',
    'termos',
    'privacidade',
    'troca',
    'devolução',
    'garantia',
    'frete',
    'entrega',
    'pagamento',
    'quemsomos',
    'quem somos',
    'história',
    'missão',
    'visão',
  ]
  const lower = query.toLowerCase()
  return institutionalKeywords.some((kw) => lower.includes(kw))
}

export function checkKeywordRelevance(
  query: string,
  keywords: Array<{ keyword: string; weight: number; is_blocking: boolean }>,
): { isBlocked: boolean; relevanceScore: number } {
  const lower = query.toLowerCase()
  let relevanceScore = 0
  let isBlocked = false
  for (const kw of keywords) {
    if (!kw?.keyword) continue
    const kwLower = kw.keyword.toLowerCase()
    if (lower.includes(kwLower)) {
      if (kw.is_blocking) {
        isBlocked = true
      }
      relevanceScore += kw.weight || 1
    }
  }
  return { isBlocked, relevanceScore }
}

export function extractProducts(data: any): any[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.stock)) return data.stock
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.products)) return data.products
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.results)) return data.results

  const values = Object.values(data)
  const allObjects = values.every((v) => v && typeof v === 'object' && !Array.isArray(v))
  if (allObjects && values.length > 0) {
    const productLike = values.filter((v: any) => v && typeof v === 'object' && v.id) as any[]
    if (productLike.length > 0) return productLike
  }

  return []
}

export function buildProductContext(products: any[]): any[] {
  if (!Array.isArray(products)) return []
  return products.map((p: any) => ({
    id: p.id,
    name: p.name || p.title || '',
    sku: p.sku || '',
    category: p.category || '',
    description: p.description || '',
    technical_info: p.technical_info || null,
    image_url: p.image_url || '',
    manufacturer: p.manufacturer || p.manufacturer_name || 'N/A',
    price_usd: p.price_usd ?? null,
    price_brl: p.price_brl ?? null,
    price_nationalized_sales: p.price_nationalized_sales ?? null,
    price_nationalized_cost: p.price_nationalized_cost ?? null,
    price_usa_rebate: p.price_usa_rebate ?? null,
    weight: p.weight ?? null,
    is_discontinued: p.is_discontinued ?? false,
  }))
}

export function mergeProductResults(products: any[]): any[] {
  const seen = new Set<string>()
  const merged: any[] = []
  for (const p of products) {
    if (!p?.id || seen.has(p.id)) continue
    seen.add(p.id)
    merged.push(p)
  }
  return merged
}

const EXCLUSION_WORDS = new Set([
  'ela',
  'ele',
  'este',
  'esta',
  'esse',
  'essa',
  'isto',
  'isso',
  'a',
  'o',
  'as',
  'os',
  'um',
  'uma',
  'uns',
  'umas',
  'it',
  'this',
  'that',
  'these',
  'those',
  'the',
  'an',
  'compare',
  'camera',
  'lens',
  'microphone',
  'tripod',
  'battery',
  'cable',
  'monitor',
  'light',
  'card',
  'case',
  'bag',
  'mount',
  'plate',
  'grip',
  'head',
  'stand',
  'boom',
  'clamp',
  'filter',
  'recorder',
  'switcher',
  'converter',
  'adapter',
  'ptz',
  '4k',
  'hdmi',
  'sdi',
  'ndi',
])

export async function extractEntities(query: string, _apiKey: string): Promise<string[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  if (trimmed.includes(' ')) {
    return Array.from(new Set([trimmed.toLowerCase()]))
  }

  if (!EXCLUSION_WORDS.has(trimmed.toLowerCase())) {
    return [trimmed]
  }

  return [trimmed]
}

export function removeStopWords(query: string, stopWords: string[]): string {
  if (!Array.isArray(stopWords) || stopWords.length === 0) return query
  const stopSet = new Set(stopWords.map((w) => w.toLowerCase().trim()))
  const words = query.split(/\s+/).filter((w) => !stopSet.has(w.toLowerCase().trim()))
  return words.join(' ').trim()
}

export async function searchAllEntities(
  entities: string[],
  fallbackQuery: string,
  searchFn: (term: string) => Promise<any[]>,
): Promise<{ products: any[]; searchCount: number }> {
  const allProducts: any[] = []
  const seenIds = new Set<string>()
  let searchCount = 0
  const terms = Array.from(new Set([...entities, fallbackQuery])).filter(
    (t) => t && t.trim().length > 0,
  )
  for (const term of terms) {
    try {
      const results = await searchFn(term)
      if (results.length > 0) {
        searchCount++
        for (const p of results) {
          if (p?.id && !seenIds.has(p.id)) {
            seenIds.add(p.id)
            allProducts.push(p)
          }
        }
      }
    } catch (err) {
      console.error(`[searchAllEntities] Error for term="${term}":`, err)
    }
  }
  return { products: allProducts, searchCount }
}

export function isTechnicalQuery(query: string): boolean {
  const technicalKeywords = [
    'especificação',
    'especificações',
    'spec',
    'specs',
    'dimensão',
    'dimensões',
    'peso',
    'voltagem',
    'potência',
    'watt',
    'watts',
    'resolução',
    'sensor',
    'lente',
    'zoom',
    'frequência',
    'interface',
    'conexão',
    'porta',
    'usb',
    'hdmi',
    'sdi',
    'xdm',
    'protocolo',
    'compatível',
    'compatibilidade',
    'requisito',
    'requisitos',
    'manual',
    'datasheet',
    'manual do produto',
    'característica',
    'características',
    'technical',
    'técnico',
    'técnica',
  ]
  const lower = query.toLowerCase()
  return technicalKeywords.some((kw) => lower.includes(kw))
}
