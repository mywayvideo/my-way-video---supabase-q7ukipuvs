export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .slice(0, 500)
}

const INSTITUTIONAL_KEYWORDS = [
  'empresa',
  'sobre',
  'quem somos',
  'missão',
  'visão',
  'valores',
  'contato',
  'telefone',
  'email',
  'endereço',
  'onde fica',
  'localização',
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
  'forma de pagamento',
  'prazo',
  'reembolso',
  'cancelamento',
  'history',
  'about',
  'company',
  'contact',
  'shipping',
  'warranty',
  'company info',
  'quem é',
  'o que é a',
  'nossa loja',
]

export function isInstitutionalQuery(query: string): boolean {
  const q = query.toLowerCase()
  return INSTITUTIONAL_KEYWORDS.some((kw) => q.includes(kw))
}

interface AvproKeyword {
  keyword: string
  weight: number
  is_blocking: boolean
}

export function checkKeywordRelevance(
  query: string,
  keywords: AvproKeyword[],
): { isBlocked: boolean; relevanceScore: number } {
  if (!keywords || keywords.length === 0) {
    return { isBlocked: false, relevanceScore: 0 }
  }
  const q = query.toLowerCase()
  let relevanceScore = 0
  for (const kw of keywords) {
    const kwLower = (kw.keyword || '').toLowerCase()
    if (!kwLower) continue
    if (q.includes(kwLower)) {
      if (kw.is_blocking) {
        return { isBlocked: true, relevanceScore: 0 }
      }
      relevanceScore += kw.weight || 1
    }
  }
  return { isBlocked: false, relevanceScore }
}

export function extractProducts(data: any): any[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.products)) return data.products
  if (Array.isArray(data?.stock)) return data.stock
  if (Array.isArray(data?.results)) return data.results
  return []
}

export function buildProductContext(products: any[]): any[] {
  if (!products || products.length === 0) return []
  return products.slice(0, 20).map((p: any) => ({
    id: p.id,
    name: p.name || p.title || '',
    sku: p.sku || '',
    category: p.category || '',
    description: (p.description || '').slice(0, 300),
    price_usd: p.price_usd ?? null,
    price_brl: p.price_brl ?? null,
    price_nationalized_sales: p.price_nationalized_sales ?? null,
    image_url: p.image_url || '',
    stock: p.stock ?? null,
    manufacturer: p.manufacturer || p.manufacturer_name || '',
  }))
}

export function mergeProductResults(...arrays: any[][]): any[] {
  const seen = new Set<string>()
  const merged: any[] = []
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      if (!item?.id) continue
      const key = String(item.id)
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(item)
      }
    }
  }
  return merged
}

const STOP_WORDS_DEFAULT = [
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
  'que',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'with',
  'without',
  'in',
  'on',
]

export function removeStopWords(query: string, stopWords: string[]): string {
  if (!query) return ''
  const allStop = [...STOP_WORDS_DEFAULT, ...(stopWords || [])].map((w) => w.toLowerCase().trim())
  const stopSet = new Set(allStop)
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => {
      const cleaned = t.replace(/[^\wáéíóúãõâêôç]/gi, '').trim()
      return cleaned.length > 0 && !stopSet.has(cleaned)
    })
  return tokens.join(' ')
}

export async function extractEntities(query: string, apiKey: string): Promise<string[]> {
  if (!query || query.trim().length === 0) return [query]
  if (!apiKey) return [query]

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
              'Extract search entities from the user query for a product search. Return a JSON array of strings, each being a distinct search term or entity. Include the original query as the first element. Only return the JSON array, no other text.',
          },
          { role: 'user', content: query },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
    })
    if (!response.ok) return [query]
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content?.trim()
    if (!content) return [query]
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    }
    return [query]
  } catch {
    return [query]
  }
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

  for (const entity of entities) {
    if (entity === originalQuery) continue
    const entityResults = await searchFn(entity)
    if (entityResults.length > 0) {
      return { products: entityResults, usedFallback: true }
    }
  }

  return { products: primaryResults, usedFallback: false }
}
