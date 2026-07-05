const DEFAULT_STOP_WORDS = [
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
  'e',
  'ou',
  'para',
  'com',
  'sem',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'que',
  'qual',
  'quais',
  'preço',
  'valor',
  'quanto',
  'custa',
  'quero',
  'preciso',
  'procurando',
  'busco',
  'quero comprar',
]

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, 500)
}

export function removeStopWords(query: string, stopWords: string[]): string {
  const allStopWords = [...new Set([...DEFAULT_STOP_WORDS, ...(stopWords || [])])]
  const words = query.toLowerCase().split(' ')
  const filtered = words.filter((w) => w.length > 1 && !allStopWords.includes(w))
  return filtered.length > 0 ? filtered.join(' ') : query
}

export function isInstitutionalQuery(query: string): boolean {
  const lower = query.toLowerCase()
  const institutionalKeywords = [
    'empresa',
    'sobre',
    'contato',
    'endereço',
    'telefone',
    'email',
    'horário',
    'horario',
    'funcionamento',
    'quem somos',
    'política',
    'politica',
    'termos',
    'privacidade',
    'devolução',
    'devolucao',
    'garantia',
    'entrega',
    'frete',
    'pagamento',
    'formas de pagamento',
    'onde fica',
    'como chegar',
    'redes sociais',
    'instagram',
    'facebook',
    'whatsapp',
  ]
  return institutionalKeywords.some((kw) => lower.includes(kw))
}

export function checkKeywordRelevance(
  query: string,
  keywords: any[],
): { isBlocked: boolean; relevanceScore: number } {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return { isBlocked: false, relevanceScore: 0 }
  }

  const lowerQuery = query.toLowerCase()
  let score = 0
  let blocked = false

  for (const kw of keywords) {
    const keyword = (kw.keyword || '').toLowerCase()
    if (!keyword) continue

    if (lowerQuery.includes(keyword)) {
      if (kw.is_blocking) {
        blocked = true
      }
      score += parseFloat(kw.weight) || 1
    }
  }

  return { isBlocked: blocked, relevanceScore: score }
}

export function extractProducts(data: any): any[] {
  if (!data) return []

  if (Array.isArray(data)) return data

  if (Array.isArray(data?.products)) return data.products

  if (Array.isArray(data?.data)) return data.data

  if (data && typeof data === 'object') {
    const values = Object.values(data)
    const arrayVal = values.find((v) => Array.isArray(v)) as any[] | undefined
    if (arrayVal) return arrayVal
  }

  return []
}

export function buildProductContext(products: any[]): any[] {
  if (!Array.isArray(products)) return []

  return products.slice(0, 20).map((p: any) => ({
    id: p.id,
    name: p.name || p.title || '',
    sku: p.sku || '',
    category: p.category || '',
    description: (p.description || '').slice(0, 500),
    price_usd: p.price_usd,
    price_brl: p.price_brl,
    price_nationalized_sales: p.price_nationalized_sales,
    price_nationalized_cost: p.price_nationalized_cost,
    stock: p.stock,
    image_url: p.image_url,
    weight: p.weight,
    is_discontinued: p.is_discontinued,
    technical_info: p.technical_info,
    manufacturer: p.manufacturer || p.manufacturer_name || 'N/A',
  }))
}

export function mergeProductResults(...arrays: any[][]): any[] {
  const seen = new Set<string>()
  const merged: any[] = []

  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      if (item && item.id && !seen.has(item.id)) {
        seen.add(item.id)
        merged.push(item)
      }
    }
  }

  return merged
}

export async function extractEntities(query: string, apiKey: string): Promise<string[]> {
  const trimmed = query.trim()
  if (!trimmed) return [trimmed]

  const words = trimmed.split(' ').filter((w) => w.length > 1)
  if (words.length <= 1) return [trimmed]

  const tokens = trimmed.split(/\s+/)
  const entities = new Set<string>()
  entities.add(trimmed)

  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j <= Math.min(i + 4, tokens.length); j++) {
      const phrase = tokens.slice(i, j).join(' ')
      if (phrase.length > 2) entities.add(phrase)
    }
  }

  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a product search term extractor for an audiovisual e-commerce catalog. Extract ONLY meaningful product-related terms. NEVER include filler words (compare, vs, versus, difference, com, de, para, etc.), generic words (camera, lens, microphone), or standalone brand names. Extract at most 3 items. Prefer exact model name + number (e.g., "Sony FX6"). Return ONLY a JSON array of strings, no explanation.',
            },
            { role: 'user', content: `Query: "${trimmed}"` },
          ],
          temperature: 0,
          max_tokens: 200,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        const content = result?.choices?.[0]?.message?.content || '[]'
        const cleaned = content.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) {
          for (const e of parsed) {
            if (typeof e === 'string' && e.trim()) entities.add(e.trim())
          }
        }
      }
    } catch (err) {
      console.error('[search-utils] Entity extraction failed:', err)
    }
  }

  return Array.from(entities)
}

export async function searchWithEntityFallback(
  entities: string[],
  originalQuery: string,
  searchFn: (term: string) => Promise<any[]>,
): Promise<{ products: any[]; usedFallback: boolean }> {
  const primaryResults = await searchFn(originalQuery)
  if (primaryResults.length > 0) {
    return { products: primaryResults, usedFallback: false }
  }

  const sortedEntities = entities
    .filter((e) => e !== originalQuery)
    .sort((a, b) => b.length - a.length)

  for (const entity of sortedEntities) {
    const results = await searchFn(entity)
    if (results.length > 0) {
      return { products: results, usedFallback: true }
    }
  }

  return { products: [], usedFallback: false }
}
