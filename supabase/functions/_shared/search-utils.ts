import { createClient } from 'npm:@supabase/supabase-js'

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
  'a',
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

export function checkKeywordRelevance(query: string, keywords: string[]): boolean {
  const lower = query.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

export function extractProducts(text: string): Array<{ name: string; description?: string }> {
  const products: Array<{ name: string; description?: string }> = []
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
      const name = trimmed.replace(/^[-*]\s*|^\d+\.\s*/, '').trim()
      if (name.length > 3) {
        products.push({ name })
      }
    }
  }
  return products
}

export function buildProductContext(products: any[]): string {
  if (!products || products.length === 0) return ''
  const lines = products.map((p, i) => {
    const name = p.name || ''
    const price = p.price_brl ? ` - R$ ${p.price_brl}` : ''
    const stock = p.stock !== undefined ? ` (estoque: ${p.stock})` : ''
    return `${i + 1}. ${name}${price}${stock}`
  })
  return `Produtos encontrados:\n${lines.join('\n')}`
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

export function extractEntities(query: string): string[] {
  const cleaned = removeStopWords(query)
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2)
  return [...new Set(words)]
}

export function removeStopWords(text: string): string {
  const words = text.toLowerCase().split(/\s+/)
  const filtered = words.filter((w) => !STOP_WORDS.has(w))
  return filtered.join(' ').trim()
}

export async function searchAllEntities(
  supabaseUrl: string,
  supabaseKey: string,
  query: string,
  limit: number = 10,
): Promise<any[]> {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const terms = extractEntities(query)
  if (terms.length === 0) return []

  const orFilter = terms
    .map((t) => `name.ilike.%${t}%,description.ilike.%${t}%,sku.ilike.%${t}%`)
    .join(',')

  const { data, error } = await supabase
    .from('products')
    .select('id,name,sku,description,price_brl,price_usd,stock,image_url,category')
    .or(orFilter)
    .limit(limit)

  if (error || !data) return []
  return data
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
    'hdmI',
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
  ]
  const lower = query.toLowerCase()
  return technicalKeywords.some((kw) => lower.includes(kw))
}

export function extractFilters(query: string): {
  minPrice?: number
  maxPrice?: number
  category?: string
} {
  const filters: { minPrice?: number; maxPrice?: number; category?: string } = {}
  const lower = query.toLowerCase()

  const maxMatch = lower.match(/(?:até|max|máximo|máx)[:\s]+r?\$?\s*(\d+)/)
  if (maxMatch) filters.maxPrice = parseFloat(maxMatch[1])

  const minMatch = lower.match(/(?:a partir de|min|mínimo|mín)[:\s]+r?\$?\s*(\d+)/)
  if (minMatch) filters.minPrice = parseFloat(minMatch[1])

  const categories = [
    'camera',
    'câmera',
    'microfone',
    'tripé',
    'iluminação',
    'lente',
    'monitor',
    'gravador',
    'cabo',
    'estúdio',
  ]
  for (const cat of categories) {
    if (lower.includes(cat)) {
      filters.category = cat
      break
    }
  }

  return filters
}

export function applyZoomFilter(
  products: any[],
  filters: { minPrice?: number; maxPrice?: number; category?: string },
): any[] {
  return products.filter((p) => {
    if (
      filters.minPrice !== undefined &&
      p.price_brl !== undefined &&
      p.price_brl < filters.minPrice
    )
      return false
    if (
      filters.maxPrice !== undefined &&
      p.price_brl !== undefined &&
      p.price_brl > filters.maxPrice
    )
      return false
    if (filters.category && p.category) {
      if (!p.category.toLowerCase().includes(filters.category.toLowerCase())) return false
    }
    return true
  })
}

export function detectComparison(query: string): boolean {
  const comparisonKeywords = [
    'vs',
    'versus',
    'ou',
    'comparar',
    'comparação',
    'diferença',
    'diferenças',
    'melhor que',
    'pior que',
    'qual é melhor',
    'compara',
  ]
  const lower = query.toLowerCase()
  return comparisonKeywords.some((kw) => lower.includes(kw))
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

export function isGenericSearch(query: string): boolean {
  const cleaned = query.toLowerCase().trim()
  if (cleaned.length < 4) return true
  const words = cleaned.split(/\s+/)
  const nonGeneric = words.filter((w) => !GENERIC_WORDS.has(w))
  return nonGeneric.length === 0
}

export function filterAccessories(products: any[]): any[] {
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
  return products.filter((p) => {
    const name = (p.name || '').toLowerCase()
    const category = (p.category || '').toLowerCase()
    return !accessoryKeywords.some((kw) => name.includes(kw) || category.includes(kw))
  })
}

export function cleanPortugueseGenericWords(query: string): string {
  const words = query.toLowerCase().split(/\s+/)
  const filtered = words.filter((w) => !GENERIC_WORDS.has(w))
  return filtered.join(' ').trim()
}
