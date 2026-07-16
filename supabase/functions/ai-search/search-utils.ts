export function sanitizeInput(input: string): string {
  if (!input) return ''
  return input.trim().replace(/[<>]/g, '').slice(0, 1000)
}

export function isInstitutionalQuery(query: string): boolean {
  const institutionalKeywords = [
    'empresa',
    'sobre',
    'contato',
    'onde ficam',
    'endereço',
    'telefone',
    'email',
    'horário',
    'horario',
    'funcionamento',
    'entrega',
    'frete',
    'pagamento',
    'prazo',
    'garantia',
    'troca',
    'devolução',
    'devolucao',
    'política',
    'politica',
    'quem somos',
    'missão',
    'missao',
    'visão',
    'visao',
  ]
  const lower = query.toLowerCase()
  return institutionalKeywords.some((kw) => lower.includes(kw))
}

export function checkKeywordRelevance(query: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false
  const lower = query.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

export function extractProducts(text: string): any[] {
  if (!text) return []
  const products: any[] = []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (parsed.products && Array.isArray(parsed.products)) return parsed.products
    return [parsed]
  } catch {
    return []
  }
}

export function buildProductContext(products: any[]): string {
  if (!products || products.length === 0) return ''
  const lines = products.slice(0, 10).map((p: any, i: number) => {
    const name = p.name || p.product_name || 'N/A'
    const price = p.price_brl || p.price || p.product_price || 'N/A'
    const sku = p.sku || ''
    const stock = p.stock !== undefined ? p.stock : ''
    const category = p.category || ''
    return `${i + 1}. ${name}${sku ? ` (SKU: ${sku})` : ''}${category ? ` [${category}]` : ''} - Preço: R$ ${price}${stock !== '' ? ` - Estoque: ${stock}` : ''}`
  })
  return lines.join('\n')
}

export function mergeProductResults(results: any[][]): any[] {
  if (!results || results.length === 0) return []
  const seen = new Set<string>()
  const merged: any[] = []
  for (const arr of results) {
    if (!arr) continue
    for (const item of arr) {
      if (!item) continue
      const key = item.id || item.sku || item.name || JSON.stringify(item)
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(item)
      }
    }
  }
  return merged
}

export function extractEntities(query: string): string[] {
  if (!query) return []
  const stopWords = new Set([
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'uns',
    'umas',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'em',
    'no',
    'na',
    'nos',
    'nas',
    'com',
    'sem',
    'para',
    'por',
    'que',
    'qual',
    'quais',
    'eu',
    'você',
    'voce',
    'me',
    'meu',
    'minha',
    'quero',
    'preciso',
    'gostaria',
    'procuro',
    'busco',
    'ache',
    'encontre',
    'mostrar',
    'ver',
    'tem',
    'tenho',
    'e',
    'ou',
    'mas',
    'como',
    'onde',
    'quando',
  ])
  const words = query
    .toLowerCase()
    .replace(/[^\w\sà-úÀ-Ú-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w))
  return [...new Set(words)]
}

export function removeStopWords(query: string): string {
  if (!query) return ''
  const stopWords = new Set([
    'o',
    'a',
    'os',
    'as',
    'um',
    'uma',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'em',
    'no',
    'na',
    'nos',
    'nas',
    'com',
    'sem',
    'para',
    'por',
    'que',
    'qual',
    'quais',
    'e',
    'ou',
    'mas',
  ])
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !stopWords.has(w))
    .join(' ')
}

export async function searchAllEntities(
  supabaseClient: any,
  entities: string[],
  limit: number = 10,
): Promise<any[]> {
  if (!entities || entities.length === 0) return []
  const results: any[] = []
  for (const entity of entities) {
    const { data, error } = await supabaseClient
      .from('products')
      .select('*')
      .or(`name.ilike.%${entity}%,description.ilike.%${entity}%,sku.ilike.%${entity}%`)
      .limit(limit)
    if (!error && data) {
      results.push(...data)
    }
  }
  return mergeProductResults([results])
}

export function isTechnicalQuery(query: string): boolean {
  const techKeywords = [
    'especificação',
    'especificacao',
    'spec',
    'specs',
    'sensor',
    'resolução',
    'resolucao',
    'megapixel',
    'mp',
    'lente',
    'focal',
    'zoom',
    'óptico',
    'optico',
    'iso',
    'shutter',
    'obturador',
    'velocidade',
    'peso',
    'dimensões',
    'dimensoes',
    'tamanho',
    'interface',
    'conexão',
    'conexao',
    'usb',
    'hdmi',
    'bateria',
    'autonomia',
    'watts',
    'potência',
    'potencia',
    'frequência',
    'frequencia',
    'hz',
    'khz',
    'mhz',
    'impedância',
    'impedancia',
    'ohms',
    'snr',
    'latência',
    'latencia',
    'throughput',
    'bandwidth',
  ]
  const lower = query.toLowerCase()
  return techKeywords.some((kw) => lower.includes(kw))
}

export function extractFilters(query: string): any {
  const filters: any = {}
  const lower = query.toLowerCase()

  const priceMatch = lower.match(
    /(?:até|ate|max|máximo|maximo|abaixo de)\s*r?\$?\s*(\d+(?:[.,]\d+)?)/,
  )
  if (priceMatch) {
    filters.maxPrice = parseFloat(priceMatch[1].replace(',', '.'))
  }

  const minPriceMatch = lower.match(
    /(?:acima de|mínimo|minimo|a partir de)\s*r?\$?\s*(\d+(?:[.,]\d+)?)/,
  )
  if (minPriceMatch) {
    filters.minPrice = parseFloat(minPriceMatch[1].replace(',', '.'))
  }

  const stockMatch = lower.match(/(?:em estoque|disponível|disponivel|com estoque)/)
  if (stockMatch) {
    filters.inStock = true
  }

  const brands = [
    'canon',
    'nikon',
    'sony',
    'panasonic',
    'blackmagic',
    'dji',
    'shure',
    'sennheiser',
    'rode',
    'manfrotto',
  ]
  for (const brand of brands) {
    if (lower.includes(brand)) {
      filters.brand = brand
      break
    }
  }

  return filters
}

export function applyZoomFilter(products: any[], filters: any): any[] {
  if (!products || products.length === 0) return []
  let filtered = [...products]

  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter((p) => {
      const price = p.price_brl || p.price || 0
      return price <= filters.maxPrice
    })
  }

  if (filters.minPrice !== undefined) {
    filtered = filtered.filter((p) => {
      const price = p.price_brl || p.price || 0
      return price >= filters.minPrice
    })
  }

  if (filters.inStock) {
    filtered = filtered.filter((p) => p.stock && p.stock > 0)
  }

  if (filters.brand) {
    filtered = filtered.filter((p) => {
      const name = (p.name || '').toLowerCase()
      const manufacturer = (p.manufacturer_name || p.category || '').toLowerCase()
      return name.includes(filters.brand) || manufacturer.includes(filters.brand)
    })
  }

  return filtered
}

export function detectComparison(query: string): boolean {
  const comparisonKeywords = [
    'vs',
    'versus',
    'ou',
    'melhor que',
    'comparar',
    'comparação',
    'comparacao',
    'diferença',
    'diferenca',
    'qual o melhor',
    'qual escolher',
    'qual comprar',
  ]
  const lower = query.toLowerCase()
  return comparisonKeywords.some((kw) => lower.includes(kw))
}

export function generateFallbackTerms(query: string): string[] {
  if (!query) return []
  const cleaned = query
    .toLowerCase()
    .replace(/[^\w\sà-ú-]/g, ' ')
    .trim()
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2)
  const terms: string[] = [cleaned]
  if (words.length > 1) {
    terms.push(words.slice(0, 2).join(' '))
    for (const word of words) {
      if (word.length > 3) {
        terms.push(word)
      }
    }
  }
  return [...new Set(terms)]
}

export function isGenericSearch(query: string): boolean {
  const genericWords = new Set([
    'produto',
    'produtos',
    'item',
    'itens',
    'tudo',
    'todos',
    'qualquer',
    'algum',
    'mostrar',
    'ver',
    'listar',
    'catálogo',
    'catalogo',
  ])
  const lower = query.toLowerCase().trim()
  return genericWords.has(lower) || (lower.length <= 3 && !lower.match(/\d/))
}

export function filterAccessories(products: any[]): any[] {
  if (!products || products.length === 0) return []
  const accessoryKeywords = [
    'capa',
    'case',
    'bolsa',
    'tripé',
    'tripé',
    'cabo',
    'adaptador',
    'carregador',
    'bateria',
    'filtro',
    'lente de proteção',
    'proteção',
    'mount',
    'suporte',
    'bracket',
    'parafuso',
    'alicate',
    'chave',
    'fita',
    'adesivo',
  ]
  return products.filter((p) => {
    const name = (p.name || '').toLowerCase()
    const category = (p.category || '').toLowerCase()
    const text = name + ' ' + category
    return !accessoryKeywords.some((kw) => text.includes(kw))
  })
}

export function cleanPortugueseGenericWords(query: string): string {
  if (!query) return ''
  const genericWords = new Set([
    'quero',
    'preciso',
    'gostaria',
    'procuro',
    'busco',
    'ache',
    'encontre',
    'mostrar',
    'mostra',
    'ver',
    'olhar',
    'ver',
    'tem',
    'tenho',
    'saber',
    'por favor',
    'pfv',
    'oi',
    'olá',
    'ola',
    'bom dia',
    'boa tarde',
    'boa noite',
  ])
  const words = query.toLowerCase().split(/\s+/)
  const cleaned = words.filter((w) => !genericWords.has(w))
  return cleaned.join(' ').trim()
}
