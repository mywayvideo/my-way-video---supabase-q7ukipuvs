export function sanitizeInput(text: string): string {
  return text.trim().slice(0, 1000)
}

export function isInstitutionalQuery(text: string): boolean {
  const kws = [
    'empresa', 'sobre', 'quem somos', 'contato', 'onde fica', 'endereço',
    'telefone', 'email', 'horário', 'horario', 'funcionamento', 'política',
    'politica', 'termos', 'privacidade', 'troca', 'devolução', 'devolucao',
    'garantia', 'frete', 'entrega', 'prazo', 'pagamento', 'forma de pagamento',
    'company', 'about', 'contact', 'shipping', 'delivery', 'payment',
    'warranty', 'return', 'refund', 'terms', 'privacy',
  ]
  const lower = text.toLowerCase()
  return kws.some((kw) => lower.includes(kw))
}

export function checkKeywordRelevance(
  text: string,
  keywordList: { keyword: string; weight: number; is_blocking: boolean }[],
): { isBlocked: boolean; relevanceScore: number } {
  if (!keywordList || keywordList.length === 0)
    return { isBlocked: false, relevanceScore: 1 }
  const lower = text.toLowerCase()
  let relevanceScore = 0
  let isBlocked = false
  for (const kw of keywordList) {
    const keyword = (kw.keyword || '').toLowerCase()
    if (!keyword) continue
    if (lower.includes(keyword)) {
      if (kw.is_blocking) isBlocked = true
      relevanceScore += Number(kw.weight) || 1
    }
  }
  return { isBlocked, relevanceScore }
}

export function extractProducts(rpcData: any): any[] {
  if (!rpcData) return []
  if (Array.isArray(rpcData)) return rpcData
  if (Array.isArray(rpcData?.data)) return rpcData.data
  if (Array.isArray(rpcData?.products)) return rpcData.products
  return []
}

export function buildProductContext(products: any[]): any[] {
  if (!products || products.length === 0) return []
  return products.map((p) => ({
    id: p.id,
    name: p.name || p.title || '',
    sku: p.sku || '',
    category: p.category || '',
    description: p.description || '',
    price_usd: p.price_usd,
    price_brl: p.price_brl,
    price_nationalized_sales: p.price_nationalized_sales,
    price_nationalized_currency: p.price_nationalized_currency,
    image_url: p.image_url || '',
    technical_info: p.technical_info || '',
    manufacturer: p.manufacturer || p.manufacturer_name || '',
    stock: p.stock,
    weight: p.weight,
  }))
}

export function mergeProductResults(arrays: any[][]): any[] {
  const seen = new Set<string>()
  const merged: any[] = []
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue
    for (const p of arr) {
      if (!p || !p.id) continue
      const key = String(p.id)
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(p)
      }
    }
  }
  return merged
}

export async function extractEntities(
  query: string,
  openaiKey: string,
): Promise<string[]> {
  if (!query.trim()) return [query]
  if (!openaiKey) return [query]
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Extract search terms from the user query for a product catalog. Return a JSON array of strings (max 5). Example: ["canon eos", "lente 50mm"]',
          },
          { role: 'user', content: query },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    })
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content || ''
    const entities = JSON.parse(content)
    if (Array.isArray(entities) && entities.length > 0) {
      return entities
        .filter((e) => typeof e === 'string' && e.trim().length > 0)
        .slice(0, 5)
    }
  } catch (e) {
    console.error('[extractEntities] error:', e)
  }
  return [query]
}

export function removeStopWords(query: string, stopWords: string[]): string {
  if (!stopWords || stopWords.length === 0) return query
  let result = query
  for (const sw of stopWords) {
    if (!sw) continue
    const regex = new RegExp(`\\b${sw.toLowerCase()}\\b`, 'gi')
    result = result.replace(regex, '')
  }
  return result.replace(/\s+/g, ' ').trim()
}
