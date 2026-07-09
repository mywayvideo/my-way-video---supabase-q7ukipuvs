const STOP_WORDS = new Set([
  'a',
  'o',
  'as',
  'os',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'ou',
  'um',
  'uma',
  'uns',
  'umas',
  'que',
  'com',
  'sem',
  'para',
  'por',
  'no',
  'na',
  'nos',
  'nas',
  'em',
  'ao',
  'aos',
  'à',
  'às',
  'se',
  'mas',
  'como',
  'mais',
  'menos',
  'muito',
  'pouco',
  'já',
  'ainda',
  'também',
  'só',
  'sim',
  'não',
  'meu',
  'minha',
  'seu',
  'sua',
  'este',
  'esta',
  'esse',
  'essa',
  'aquele',
  'aquela',
  'isto',
  'isso',
  'aquilo',
  'eu',
  'tu',
  'ele',
  'ela',
  'nós',
  'vós',
  'eles',
  'elas',
  'me',
  'te',
  'lhe',
  'nos',
  'vos',
  'lhes',
  'the',
  'of',
  'for',
  'and',
  'or',
  'is',
  'a',
  'an',
])

const INSTITUTIONAL_KEYWORDS = [
  'entrega',
  'shipping',
  'frete',
  'prazo',
  'pagamento',
  'payment',
  'forma',
  'pagar',
  'cartão',
  'boleto',
  'pix',
  'contato',
  'contact',
  'telefone',
  'email',
  'whatsapp',
  'empresa',
  'company',
  'sobre',
  'about',
  'quem',
  'política',
  'policy',
  'troca',
  'return',
  'devolução',
  'garantia',
  'warranty',
  'suporte',
  'support',
  'ajuda',
  'help',
  'cnpj',
  'endereço',
  'address',
  'horário',
  'horario',
]

const TECHNICAL_KEYWORDS = [
  'especificação',
  'especificacao',
  'spec',
  'specification',
  'técnica',
  'tecnica',
  'technical',
  'dimensão',
  'dimensao',
  'dimension',
  'peso',
  'weight',
  'sensor',
  'tamanho',
  'size',
  'resolução',
  'resolucao',
  'resolution',
  'zoom',
  'focal',
  'lente',
  'lens',
  'iso',
  'frame rate',
  'fps',
  'montagem',
  'mount',
  'entradas',
  'outputs',
  'saídas',
  'interface',
  'conexão',
  'conexao',
  'connection',
  'potência',
  'potencia',
  'power',
  'watts',
  'volts',
  'impedância',
  'impedancia',
  'frequência',
  'frequencia',
  'frequency',
  'hertz',
  'khz',
  'mhz',
]

const GENERIC_WORDS = new Set([
  'quero',
  'preciso',
  'gostaria',
  'busco',
  'procurando',
  'pesquisar',
  'buscar',
  'procurar',
  'mostrar',
  'ver',
  'ache',
  'encontre',
  'tenho',
  'interesse',
  'interessado',
  'produto',
  'produtos',
  'equipamento',
  'equipamentos',
  'item',
  'itens',
])

const ACCESSORY_KEYWORDS = [
  'bateria',
  'battery',
  'cabo',
  'cable',
  'carregador',
  'charger',
  'case',
  'capa',
  'funda',
  'bag',
  'mala',
  'tripé',
  'tripod',
  'filtro',
  'filter',
  'adapter',
  'memory',
  'memória',
  'cartão',
  'card',
  'strap',
  'alça',
  'alca',
  'pelicula',
  'protetor',
  'protective',
  'cover',
  'pochete',
  'backpack',
  'mochila',
  'bolsa',
]

const BRAND_NAMES = [
  'sony',
  'canon',
  'nikon',
  'panasonic',
  'blackmagic',
  'dji',
  'ronin',
  'sennheiser',
  'rode',
  'shure',
]

export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input.trim().replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, 500)
}

export function isInstitutionalQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return INSTITUTIONAL_KEYWORDS.some((kw) => lower.includes(kw))
}

export function checkKeywordRelevance(
  query: string,
  keywords: string[],
): { isBlocked: boolean; relevanceScore: number } {
  if (!query || !keywords || keywords.length === 0) return { isBlocked: false, relevanceScore: 0 }
  const lower = query.toLowerCase()
  let isBlocked = false
  let relevanceScore = 0
  for (const kw of keywords) {
    const keyword = typeof kw === 'string' ? kw : kw?.keyword
    if (!keyword) continue
    if (lower.includes(keyword.toLowerCase())) {
      const weight = typeof kw === 'string' ? 1.0 : kw?.weight || 1.0
      const blocking = typeof kw === 'string' ? false : kw?.is_blocking || false
      relevanceScore += weight
      if (blocking) isBlocked = true
    }
  }
  return { isBlocked, relevanceScore }
}

export function extractProducts(rpcData: any): any[] {
  if (!rpcData) return []
  if (Array.isArray(rpcData)) return rpcData
  if (Array.isArray(rpcData?.stock)) return rpcData.stock
  if (Array.isArray(rpcData?.products)) return rpcData.products
  if (Array.isArray(rpcData?.data)) return rpcData.data
  if (Array.isArray(rpcData?.items)) return rpcData.items
  return []
}

export function buildProductContext(products: any[]): any[] {
  if (!products || products.length === 0) return []
  return products.slice(0, 10).map((p) => {
    const product: any = { id: p.id || '', name: p.name || p.title || 'N/A' }
    if (p.price_brl) product.price_brl = p.price_brl
    if (p.price_usd) product.price_usd = p.price_usd
    if (p.price_nationalized_sales) product.price_nationalized_sales = p.price_nationalized_sales
    if (p.price_nationalized_currency)
      product.price_nationalized_currency = p.price_nationalized_currency
    if (p.stock !== undefined && p.stock !== null) product.stock = p.stock
    if (p.sku) product.sku = p.sku
    if (p.category) product.category = p.category
    if (p.description) product.description = p.description.slice(0, 200)
    if (p.technical_info) product.technical_info = p.technical_info
    if (p.image_url) product.image_url = p.image_url
    if (p.weight) product.weight = p.weight
    if (p.is_discontinued !== undefined) product.is_discontinued = p.is_discontinued
    return product
  })
}

export function mergeProductResults(results: any[][]): any[] {
  const seen = new Set()
  const merged: any[] = []
  for (const result of results) {
    if (!result) continue
    for (const product of result) {
      if (!product) continue
      const key = product.id || product.name?.toLowerCase()
      if (key && !seen.has(key)) {
        seen.add(key)
        merged.push(product)
      }
    }
  }
  return merged
}

export function removeStopWords(text: string, stopWords: string[] = []): string {
  if (!text) return ''
  const allStopWords = new Set([...STOP_WORDS])
  for (const sw of stopWords) allStopWords.add(sw.toLowerCase())
  return text
    .split(/\s+/)
    .filter((w) => !allStopWords.has(w.toLowerCase()))
    .join(' ')
    .trim()
}

export async function extractEntities(query: string, openaiKey: string): Promise<string[]> {
  const cleaned = removeStopWords(sanitizeInput(query))
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2)
  if (words.length === 0) return [sanitizeInput(query)]
  const entities: string[] = []
  for (let i = 0; i < words.length; i++) {
    entities.push(words[i])
    if (i < words.length - 1) entities.push(`${words[i]} ${words[i + 1]}`)
    if (i < words.length - 2) entities.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }
  return [...new Set(entities)]
}

export async function searchAllEntities(
  entities: string[],
  query: string,
  searchFn: (term: string) => Promise<any[]>,
): Promise<{ products: any[]; searchCount: number }> {
  if (!entities || entities.length === 0) return { products: [], searchCount: 0 }
  const seen = new Set<string>()
  const merged: any[] = []
  let searchCount = 0

  // Sort entities by length descending (most specific first)
  const sortedEntities = [...entities].sort((a, b) => b.length - a.length)

  for (const entity of sortedEntities) {
    if (!entity || entity.length < 3) continue
    try {
      const results = await searchFn(entity)
      if (results && results.length > 0) {
        searchCount++
        // Take at most 5 per entity to ensure diverse results across entities
        const limited = results.slice(0, 5)
        for (const product of limited) {
          if (!product) continue
          const key = product.id || product.name?.toLowerCase()
          if (key && !seen.has(key)) {
            seen.add(key)
            merged.push(product)
          }
        }
      }
    } catch {
      /* continue */
    }
  }

  // Fallback: if no products found, try the original query
  if (merged.length === 0 && query && query.trim().length > 0) {
    try {
      const results = await searchFn(query)
      if (results && results.length > 0) {
        searchCount++
        for (const product of results.slice(0, 10)) {
          if (!product) continue
          const key = product.id || product.name?.toLowerCase()
          if (key && !seen.has(key)) {
            seen.add(key)
            merged.push(product)
          }
        }
      }
    } catch {
      /* continue */
    }
  }

  return { products: merged, searchCount }
}

export function isTechnicalQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return TECHNICAL_KEYWORDS.some((kw) => lower.includes(kw))
}

export function extractFilters(query: string): {
  maxPrice?: number
  minPrice?: number
  brand?: string
  category?: string
  minZoom: number | null
} {
  const filters: {
    maxPrice?: number
    minPrice?: number
    brand?: string
    category?: string
    minZoom: number | null
  } = { minZoom: null }
  const lower = query.toLowerCase()
  const maxMatch = lower.match(/(?:até|ate|max|máximo)\s+r?\$?\s*(\d+)/)
  if (maxMatch) filters.maxPrice = parseFloat(maxMatch[1])
  const minMatch = lower.match(/(?:a partir de|mínimo|min)\s+r?\$?\s*(\d+)/)
  if (minMatch) filters.minPrice = parseFloat(minMatch[1])
  const zoomMatch = lower.match(/(\d+)\s*x\s*(?:zoom|óptico|optico)/)
  if (zoomMatch) filters.minZoom = parseInt(zoomMatch[1], 10)
  for (const brand of BRAND_NAMES) {
    if (lower.includes(brand)) {
      filters.brand = brand
      break
    }
  }
  const catMatch = lower.match(/(?:categoria|tipo)\s*:?\s*(\w+)/)
  if (catMatch) filters.category = catMatch[1]
  return filters
}

export function applyZoomFilter(
  products: any[],
  minZoom: number,
): { filtered: any[]; wasFiltered: boolean } {
  if (!products || minZoom === null || minZoom === undefined)
    return { filtered: products || [], wasFiltered: false }
  const filtered = products.filter((p) => {
    const text = (
      (p.technical_info || '') +
      ' ' +
      (p.name || '') +
      ' ' +
      (p.description || '')
    ).toLowerCase()
    const zoomMatch = text.match(/(\d+)\s*x\s*(?:zoom|óptico|optico)/)
    return zoomMatch && parseInt(zoomMatch[1], 10) >= minZoom
  })
  return { filtered, wasFiltered: filtered.length < (products?.length || 0) }
}

export function detectComparison(query: string): { isComparison: boolean; terms: string[] } {
  const lower = query.toLowerCase()
  const keywords = [
    'versus',
    ' vs ',
    ' vs. ',
    'comparar',
    'comparação',
    'comparacao',
    'diferença',
    'diferenca',
    'melhor',
  ]
  const matched = keywords.find((w) => lower.includes(w))
  if (matched) {
    const parts = query
      .split(new RegExp(matched.trim(), 'i'))
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    return { isComparison: true, terms: parts.length >= 2 ? parts : [query] }
  }
  const andMatch = query.match(/(.+?)\s+e\s+(.+)/i)
  if (
    andMatch &&
    andMatch[1] &&
    andMatch[2] &&
    andMatch[1].trim().length > 2 &&
    andMatch[2].trim().length > 2
  )
    return { isComparison: true, terms: [andMatch[1].trim(), andMatch[2].trim()] }
  return { isComparison: false, terms: [query] }
}

export function generateFallbackTerms(query: string): string[] {
  const cleaned = removeStopWords(sanitizeInput(query))
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2)
  if (words.length === 0) return [sanitizeInput(query)]
  const terms: string[] = [cleaned, ...words]
  return [...new Set(terms)]
}

export function isGenericSearch(searchEntities: string[]): boolean {
  if (!searchEntities || searchEntities.length === 0) return true
  if (searchEntities.length === 1) {
    const words = searchEntities[0].split(/\s+/).filter((w) => w.length > 2)
    if (words.length === 0) return true
    if (words.length === 1 && GENERIC_WORDS.has(words[0].toLowerCase())) return true
  }
  return false
}

export function filterAccessories(products: any[]): { filtered: any[]; removedCount: number } {
  if (!products) return { filtered: [], removedCount: 0 }
  const accessories: any[] = []
  const main: any[] = []
  for (const product of products) {
    const name = (product.name || '').toLowerCase()
    if (ACCESSORY_KEYWORDS.some((kw) => name.includes(kw))) accessories.push(product)
    else main.push(product)
  }
  return { filtered: main, removedCount: accessories.length }
}

export function cleanPortugueseGenericWords(query: string): string {
  if (!query) return ''
  return query
    .split(/\s+/)
    .filter((w) => !GENERIC_WORDS.has(w.toLowerCase()))
    .join(' ')
    .trim()
}
