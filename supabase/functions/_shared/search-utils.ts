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
    price_nationalized_sales: p.price_nationalized_sales ?? null,
    price_nationalized_currency: p.price_nationalized_currency ?? null,
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

const STOP_AND_GENERIC_WORDS = new Set([
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
  'comparar',
  'with',
  'com',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'câmera',
  'camera',
  'lente',
  'microfone',
  'microfones',
  'tripé',
  'tripés',
  'monitor',
  'monitores',
  'iluminação',
  'battery',
  'bateria',
  'audio',
  'áudio',
  'video',
  'vídeo',
  'cable',
  'tripod',
  'lens',
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
  let trimmed = query.trim()
  if (trimmed.length === 0) return []

  // NEVER include "compare" in the search term
  trimmed = trimmed.replace(/\bcompare\b/gi, '').trim()

  // NEVER include punctuation like periods or commas (preserve hyphens in model names)
  trimmed = trimmed
    .replace(/[.,;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Comparison query detection: split on "com a" or "com o" to extract multiple entities
  // e.g., "sony fx3 com a Canon eos c50" → ["sony fx3", "Canon eos c50"]
  const compareParts = trimmed.split(/\s+com\s+(?:a|o)\s+/i)
  if (compareParts.length >= 2) {
    const entities: string[] = []
    for (const part of compareParts) {
      const words = part.split(/\s+/).filter((w) => !STOP_AND_GENERIC_WORDS.has(w.toLowerCase()))
      const result = words.join(' ').trim()
      if (result.length > 0) entities.push(result)
    }
    if (entities.length > 0) {
      console.log(
        `[extractEntities] comparison query detected, extracted entities=${JSON.stringify(entities)}`,
      )
      return Array.from(new Set(entities))
    }
  }

  // NEVER include generic words — extract ONLY manufacturer and model name
  const words = trimmed.split(/\s+/)
  const filteredWords = words.filter((w) => !STOP_AND_GENERIC_WORDS.has(w.toLowerCase()))

  if (filteredWords.length === 0) return []

  const result = filteredWords.join(' ').trim()
  if (result.length === 0) return []

  // Preserve original case for manufacturer/model names
  return Array.from(new Set([result]))
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

export function extractFilters(originalQuery: string): { minZoom: number | null } {
  const match = originalQuery.match(/(\d+)\s*x\s*(?:zoom|óptico|optico)?/i)
  if (match) {
    const value = parseInt(match[1], 10)
    if (!isNaN(value) && value > 0) {
      return { minZoom: value }
    }
  }
  return { minZoom: null }
}

export function applyZoomFilter(
  products: any[],
  minZoom: number | null,
): { filtered: any[]; wasFiltered: boolean } {
  if (minZoom === null || products.length === 0) {
    return { filtered: products, wasFiltered: false }
  }
  const zoomStr = `${minZoom}x`
  const filtered = products.filter((p: any) => {
    const name = (p.name || p.title || '').toLowerCase()
    const description = (p.description || '').toLowerCase()
    const specs =
      typeof p.technical_info === 'string'
        ? p.technical_info.toLowerCase()
        : JSON.stringify(p.technical_info || {}).toLowerCase()
    return name.includes(zoomStr) || description.includes(zoomStr) || specs.includes(zoomStr)
  })
  return { filtered, wasFiltered: true }
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

const COMPARISON_ARTICLES = new Set([
  'compare',
  'comparar',
  'a',
  'o',
  'as',
  'os',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'with',
  'com',
  'um',
  'uma',
  'para',
  'por',
  'sobre',
])

function cleanComparisonTerm(term: string): string {
  let cleaned = term.trim()
  cleaned = cleaned
    .replace(/^[.,;:!?]+/, '')
    .replace(/[.,;:!?]+$/, '')
    .trim()
  const words = cleaned.split(/\s+/).filter((w) => !COMPARISON_ARTICLES.has(w.toLowerCase()))
  return words.join(' ').trim()
}

export function detectComparison(query: string): { isComparison: boolean; terms: string[] } {
  let cleaned = query.replace(/\bcompare\b/gi, '').trim()
  cleaned = cleaned
    .replace(/[.,;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const parts1 = cleaned.split(/\s+com\s+(?:a|o)\s+/i)
  if (parts1.length >= 2) {
    const terms = parts1.map((p) => cleanComparisonTerm(p)).filter((t) => t.length > 0)
    if (terms.length >= 2 && terms[0].toLowerCase() !== terms[1].toLowerCase()) {
      return { isComparison: true, terms: [terms[0], terms[1]] }
    }
  }

  const vsMatch = cleaned.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i)
  if (vsMatch) {
    const term1 = cleanComparisonTerm(vsMatch[1])
    const term2 = cleanComparisonTerm(vsMatch[2])
    if (term1 && term2 && term1.toLowerCase() !== term2.toLowerCase()) {
      return { isComparison: true, terms: [term1, term2] }
    }
  }

  const eMatch = cleaned.match(/^(.+?)\s+e\s+(.+)$/i)
  if (eMatch) {
    const term1 = cleanComparisonTerm(eMatch[1])
    const term2 = cleanComparisonTerm(eMatch[2])
    if (term1.length >= 3 && term2.length >= 3 && term1.toLowerCase() !== term2.toLowerCase()) {
      return { isComparison: true, terms: [term1, term2] }
    }
  }

  return { isComparison: false, terms: [] }
}

const PT_EN_MAP: Record<string, string> = {
  'zoom optico': 'optical zoom',
  'zoom óptico': 'optical zoom',
  'comprimento focal': 'focal length',
  lente: 'lens',
  lentes: 'lenses',
  câmera: 'camera',
  camera: 'camera',
  cameras: 'cameras',
  câmeras: 'cameras',
  microfone: 'microphone',
  microfones: 'microphones',
  iluminação: 'lighting',
  iluminacao: 'lighting',
  tripé: 'tripod',
  tripe: 'tripod',
  bateria: 'battery',
  baterias: 'batteries',
  cabo: 'cable',
  cabos: 'cables',
  tela: 'screen',
  gravador: 'recorder',
  gravadores: 'recorders',
  som: 'audio',
  áudio: 'audio',
  audio: 'audio',
  vídeo: 'video',
  video: 'video',
  resolução: 'resolution',
  resolucao: 'resolution',
  potência: 'power',
  potencia: 'power',
  voltagem: 'voltage',
  dimensões: 'dimensions',
  dimensao: 'dimension',
  dimensão: 'dimension',
  peso: 'weight',
  conexão: 'connection',
  conexao: 'connection',
  porta: 'port',
  portas: 'ports',
  compatível: 'compatible',
  compativel: 'compatible',
  compatibilidade: 'compatibility',
  'sem fio': 'wireless',
  estabilização: 'stabilization',
  estabilizacao: 'stabilization',
}

export function translateToEnglish(query: string): string {
  let result = query
  const keys = Object.keys(PT_EN_MAP).sort((a, b) => b.length - a.length)
  for (const pt of keys) {
    const regex = new RegExp(`\\b${pt}\\b`, 'gi')
    result = result.replace(regex, PT_EN_MAP[pt])
  }
  return result.trim()
}

const PT_GENERIC_STOP_WORDS_SET = new Set([
  'com',
  'para',
  'por',
  'sobre',
  'peso',
  'cor',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'a',
  'o',
  'as',
  'os',
  'um',
  'uma',
  'uns',
  'umas',
  'no',
  'na',
  'nos',
  'nas',
  'em',
  'que',
  'qual',
  'quais',
  'este',
  'esta',
  'esse',
  'essa',
  'isto',
  'isso',
  'ele',
  'ela',
  'eles',
  'elas',
])

export function cleanPortugueseGenericWords(query: string): string {
  const words = query.split(/\s+/).filter((w) => !PT_GENERIC_STOP_WORDS_SET.has(w.toLowerCase()))
  return words.join(' ').trim()
}

const CATEGORY_TERMS_SET = new Set([
  'camera',
  'cameras',
  'câmera',
  'câmeras',
  'lens',
  'lenses',
  'lente',
  'lentes',
  'microphone',
  'microphones',
  'microfone',
  'microfones',
  'tripod',
  'tripods',
  'tripé',
  'tripés',
  'tripe',
  'monitor',
  'monitors',
  'monitores',
  'light',
  'lights',
  'iluminação',
  'iluminacao',
  'ptz',
  '4k',
  '8k',
  'hd',
  'hdmi',
  'sdi',
  'ndi',
  'audio',
  'áudio',
  'video',
  'vídeo',
  'recorder',
  'recorders',
  'gravador',
  'gravadores',
  'switcher',
  'switchers',
  'converter',
  'converters',
  'wireless',
  'optical',
  'zoom',
  'battery',
  'batteries',
  'bateria',
  'baterias',
  'cable',
  'cabos',
  'cabo',
  'cables',
  'case',
  'bag',
  'bolsa',
  'estojo',
  'adapter',
  'adaptador',
  'mount',
  'suporte',
  'grip',
  'strap',
  'cap',
  'cover',
  'card',
  'cartão',
  'memory',
  'memória',
  'headphone',
  'screen',
  'protector',
  'teleconverter',
  'wind',
  'sony',
  'canon',
  'panasonic',
  'blackmagic',
  'datavideo',
  'sennheiser',
  'rode',
  'shure',
  'manfrotto',
  'atomos',
  'smallrig',
  'dji',
])

export function simplifyToCategoryAndNumbers(query: string): string {
  const words = query.split(/\s+/)
  const filtered = words.filter((w) => {
    const lower = w.toLowerCase()
    return CATEGORY_TERMS_SET.has(lower) || /^\d+$/.test(w) || /^\d+[a-z]*$/i.test(w)
  })
  return filtered.join(' ').trim()
}

export function generateFallbackTerms(query: string): string[] {
  const terms: string[] = []

  const translated = translateToEnglish(query)
  if (translated && translated.toLowerCase() !== query.toLowerCase()) {
    terms.push(translated)
  }

  const cleaned = cleanPortugueseGenericWords(query)
  if (cleaned && cleaned.toLowerCase() !== query.toLowerCase() && !terms.includes(cleaned)) {
    terms.push(cleaned)
  }

  const simplified = simplifyToCategoryAndNumbers(query)
  if (simplified && simplified.length > 0 && !terms.includes(simplified)) {
    terms.push(simplified)
  }

  return terms
}

const ACCESSORY_KEYWORDS_LIST = [
  'memory',
  'card',
  'battery',
  'bateria',
  'cable',
  'cabo',
  'adapter',
  'adaptador',
  'mount',
  'suporte',
  'case',
  'estojo',
  'bag',
  'bolsa',
  'grip',
  'wind',
  'screen',
  'protector',
  'cap',
  'cover',
  'carte',
  'cartão',
  'memória',
  'teleconverter',
  'converter',
  'lens cap',
  'strap',
  'headphone',
  'microphone',
  'recorder',
  'monitor',
]

export function isGenericSearch(entities: string[]): boolean {
  return entities.some((e) => e.trim().split(/\s+/).length === 1)
}

export function filterAccessories(products: any[]): { filtered: any[]; removedCount: number } {
  const accessoryLower = ACCESSORY_KEYWORDS_LIST.map((k) => k.toLowerCase())
  const nonAccessories = products.filter((p) => {
    const name = (p.name || p.title || '').toLowerCase()
    const category = (p.category || '').toLowerCase()
    return !accessoryLower.some((kw) => name.includes(kw) || category.includes(kw))
  })
  return { filtered: nonAccessories, removedCount: products.length - nonAccessories.length }
}
