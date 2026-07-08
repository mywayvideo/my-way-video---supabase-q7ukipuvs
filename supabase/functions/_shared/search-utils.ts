const STOP_WORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'a',
  'o',
  'as',
  'os',
  'e',
  'ou',
  'um',
  'uma',
  'uns',
  'umas',
  'para',
  'com',
  'sem',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'que',
  'qual',
  'quais',
  'me',
  'meu',
  'minha',
  'meus',
  'minhas',
  'seu',
  'sua',
  'seus',
  'suas',
  'the',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
])

const GENERIC_WORDS = new Set([
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
  'camera',
  'câmera',
  'cameras',
  'câmeras',
  'bom',
  'boa',
  'melhor',
  'barato',
  'barata',
  'preço',
  'valor',
  'custo',
  'quanto',
  'qual',
])

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, 1000)
}

export function isInstitutionalQuery(query: string): boolean {
  const institutionalKeywords = [
    'empresa',
    'contato',
    'endereço',
    'telefone',
    'email',
    'sobre',
    'quem somos',
    'política',
    'termos',
    'privacidade',
    'troca',
    'devolução',
    'garantia',
    'frete',
    'entrega',
    'pagamento',
    'formar',
    'como comprar',
    'ajuda',
  ]
  const lower = query.toLowerCase()
  return institutionalKeywords.some((kw) => lower.includes(kw))
}

export function checkKeywordRelevance(
  query: string,
  keywords: Array<{ keyword: string; weight?: number; is_blocking?: boolean }>,
): { isBlocked: boolean; relevanceScore: number } {
  const lower = query.toLowerCase()
  let relevanceScore = 0
  let isBlocked = false

  for (const kw of keywords) {
    const kwText = (kw.keyword || '').toLowerCase()
    if (!kwText) continue
    if (lower.includes(kwText)) {
      relevanceScore += kw.weight ?? 1.0
      if (kw.is_blocking) isBlocked = true
    }
  }

  return { isBlocked, relevanceScore }
}

export function extractProducts(rpcData: any): any[] {
  if (!rpcData) return []

  if (Array.isArray(rpcData)) {
    return rpcData.filter((p: any) => p && p.id)
  }

  if (typeof rpcData === 'object') {
    for (const key of ['stock', 'products', 'results', 'data', 'items']) {
      if (Array.isArray((rpcData as any)[key])) {
        return (rpcData as any)[key].filter((p: any) => p && p.id)
      }
    }
    if ((rpcData as any).id) return [rpcData]
  }

  if (typeof rpcData === 'string') {
    try {
      return extractProducts(JSON.parse(rpcData))
    } catch {
      return []
    }
  }

  return []
}

export function buildProductContext(products: any[]): any[] {
  if (!products || products.length === 0) return []

  return products.map((p: any) => ({
    id: p.id,
    name: p.name || p.title || '',
    sku: p.sku || '',
    category: p.category || '',
    description: p.description || '',
    price_usd: p.price_usd || 0,
    price_brl: p.price_brl || 0,
    price_nationalized_sales: p.price_nationalized_sales || 0,
    price_nationalized_currency: p.price_nationalized_currency || '',
    stock: p.stock ?? 0,
    image_url: p.image_url || '',
    weight: p.weight || 0,
    manufacturer:
      typeof p.manufacturer === 'object' && p.manufacturer
        ? p.manufacturer.name
        : p.manufacturer || '',
    technical_info: p.technical_info || '',
    is_discontinued: p.is_discontinued || false,
  }))
}

export function mergeProductResults(...arrays: any[][]): any[] {
  const seen = new Set<string>()
  const merged: any[] = []
  for (const arr of arrays) {
    if (!arr) continue
    for (const item of arr) {
      if (!item) continue
      const id = item.id || item.name || JSON.stringify(item)
      if (!seen.has(id)) {
        seen.add(id)
        merged.push(item)
      }
    }
  }
  return merged
}

export async function extractEntities(query: string, _openaiKey?: string): Promise<string[]> {
  const cleaned = removeStopWords(query)
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2)

  if (words.length === 0) {
    const rawWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
    return [...new Set(rawWords)]
  }

  return [...new Set(words)]
}

export function removeStopWords(text: string, customStopWords?: string[]): string {
  const allStopWords = new Set(STOP_WORDS)
  if (customStopWords && Array.isArray(customStopWords)) {
    for (const w of customStopWords) allStopWords.add(w.toLowerCase())
  }
  const words = text.toLowerCase().split(/\s+/)
  const filtered = words.filter((w) => !allStopWords.has(w))
  return filtered.join(' ').trim()
}

export async function searchAllEntities(
  entities: string[],
  fallbackQuery: string,
  searchFn: (term: string) => Promise<any[]>,
): Promise<{ products: any[]; searchCount: number }> {
  const seenIds = new Set<string>()
  const allProducts: any[] = []
  let searchCount = 0

  for (const entity of entities) {
    if (!entity || entity.trim().length === 0) continue
    try {
      const results = await searchFn(entity)
      if (results && results.length > 0) {
        searchCount++
        for (const p of results) {
          if (p?.id && !seenIds.has(p.id)) {
            seenIds.add(p.id)
            allProducts.push(p)
          }
        }
      }
    } catch (err) {
      console.error(`[searchAllEntities] Error for "${entity}":`, err)
    }
  }

  if (allProducts.length === 0 && fallbackQuery && fallbackQuery.trim().length > 0) {
    try {
      const results = await searchFn(fallbackQuery)
      if (results && results.length > 0) {
        searchCount++
        for (const p of results) {
          if (p?.id && !seenIds.has(p.id)) {
            seenIds.add(p.id)
            allProducts.push(p)
          }
        }
      }
    } catch (err) {
      console.error(`[searchAllEntities] Fallback error for "${fallbackQuery}":`, err)
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
    'sensor',
    'resolution',
    'resolução',
    'pixels',
    'iso',
    'fps',
    'frame rate',
    'bitrate',
    'codec',
    'hdmi',
    'sdi',
    'xlr',
    'phantom',
    'frequency',
    'frequência',
    'watt',
    'watts',
    'impedância',
    'impedance',
    'sensibilidade',
    'sensitivity',
    'distorção',
    'thd',
    'snr',
    'dynamic range',
    'faixa dinâmica',
    'peso',
    'dimensões',
    'consumo',
    'power consumption',
    'volts',
    'tamanho do sensor',
    'tamanho',
    'pesa',
    'quanto pesa',
  ]
  const lower = query.toLowerCase()
  return technicalKeywords.some((kw) => lower.includes(kw))
}

export function extractFilters(query: string): {
  minZoom: number | null
  minPrice?: number
  maxPrice?: number
  category?: string
} {
  const filters: {
    minZoom: number | null
    minPrice?: number
    maxPrice?: number
    category?: string
  } = {
    minZoom: null,
  }
  const lower = query.toLowerCase()

  const zoomMatch =
    lower.match(/(\d+)\s*x\s*(?:zoom|óptico|optical)/) ||
    lower.match(/(?:zoom|óptico|optical)\s*(\d+)\s*x/) ||
    lower.match(/(\d+)\s*x(?:\s*(?:zoom|óptico|optical))?/)
  if (
    zoomMatch &&
    (lower.includes('zoom') || lower.includes('óptico') || lower.includes('optical'))
  ) {
    filters.minZoom = parseInt(zoomMatch[1], 10)
  }

  const maxMatch = lower.match(/(?:até|max|máximo|máx)[:\s]+r?\$?\s*(\d+)/)
  if (maxMatch) filters.maxPrice = parseFloat(maxMatch[1])

  const minMatch = lower.match(/(?:a partir de|min|mínimo|mín)[:\s]+r?\$?\s*(\d+)/)
  if (minMatch) filters.minPrice = parseFloat(minMatch[1])

  return filters
}

export function applyZoomFilter(
  products: any[],
  minZoom: number,
): { filtered: any[]; wasFiltered: boolean } {
  const filtered = products.filter((p: any) => {
    const techInfo = (p.technical_info || '').toLowerCase()
    const desc = (p.description || '').toLowerCase()
    const name = (p.name || '').toLowerCase()
    const combined = `${name} ${desc} ${techInfo}`

    const zoomMatch = combined.match(/(\d+)\s*x/)
    if (zoomMatch) {
      return parseInt(zoomMatch[1], 10) >= minZoom
    }
    return true
  })

  return { filtered, wasFiltered: filtered.length < products.length }
}

export function detectComparison(query: string): { isComparison: boolean; terms: string[] } {
  const lower = query.toLowerCase()

  const comparisonPatterns = [
    /\bvs\.?\b/,
    /\bversus\b/,
    /\bcomparar\b/,
    /\bcomparação\b/,
    /\bdiferença\b/,
    /\bdiferenças\b/,
    /\bmelhor que\b/,
    /\bpior que\b/,
    /\bqual é melhor\b/,
    /\bcompara\b/,
  ]

  const compareMatch = lower.match(/(?:com a|com o)\s+(.+)/i)
  const hasPattern = comparisonPatterns.some((pattern) => pattern.test(lower))

  if (hasPattern || compareMatch) {
    const terms: string[] = []

    const vsSplit = lower.split(/\bvs\.?\b|\bversus\b/i)
    if (vsSplit.length > 1) {
      for (const part of vsSplit) {
        const trimmed = part
          .trim()
          .replace(/[.,;:!?\s]+$/, '')
          .trim()
        if (trimmed.length > 0) terms.push(trimmed)
      }
    }

    if (terms.length === 0) {
      const eSplit = lower.split(/\be\b/i)
      if (eSplit.length > 1) {
        for (const part of eSplit) {
          const trimmed = part
            .trim()
            .replace(/[.,;:!?\s]+$/, '')
            .trim()
          if (trimmed.length > 0) terms.push(trimmed)
        }
      }
    }

    if (terms.length === 0 && compareMatch && compareMatch[1]) {
      const extracted = compareMatch[1]
        .trim()
        .replace(/[.,;:!?\s]+$/, '')
        .trim()
      if (extracted.length > 0) terms.push(extracted)
    }

    if (terms.length === 0) terms.push(query.trim())

    return { isComparison: true, terms }
  }

  return { isComparison: false, terms: [query] }
}

export function generateFallbackTerms(query: string): string[] {
  const cleaned = removeStopWords(query)
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2)
  if (words.length === 0) return []
  if (words.length === 1) return [words[0]]

  const terms: string[] = [words.join(' ')]
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      terms.push(`${words[i]} ${words[j]}`)
    }
  }
  return [...new Set(terms)].slice(0, 10)
}

export function isGenericSearch(entities: string[]): boolean {
  if (!entities || entities.length === 0) return true

  for (const entity of entities) {
    const cleaned = entity.toLowerCase().trim()
    if (cleaned.length < 4) continue
    const words = cleaned.split(/\s+/)
    const nonGeneric = words.filter((w) => !GENERIC_WORDS.has(w))
    if (nonGeneric.length > 0) return false
  }

  return true
}

export function filterAccessories(products: any[]): { filtered: any[]; removedCount: number } {
  const accessoryKeywords = [
    'cabo',
    'cable',
    'adaptador',
    'adapter',
    'suporte',
    'mount',
    'capa',
    'case',
    'bag',
    'mochila',
    'bateria',
    'battery',
    'carregador',
    'charger',
    'filtro',
    'filter',
    'parafuso',
    'screw',
    'alça',
    'strap',
    'pelicula',
    'protetor',
  ]

  const filtered = products.filter((p: any) => {
    const name = (p.name || '').toLowerCase()
    const category = (p.category || '').toLowerCase()
    return !accessoryKeywords.some((kw) => name.includes(kw) || category.includes(kw))
  })

  return { filtered, removedCount: products.length - filtered.length }
}

export function cleanPortugueseGenericWords(query: string): string {
  const words = query.toLowerCase().split(/\s+/)
  const filtered = words.filter((w) => !GENERIC_WORDS.has(w))
  return filtered.join(' ').trim()
}
