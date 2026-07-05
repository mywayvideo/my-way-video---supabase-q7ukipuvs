export function sanitizeInput(text: any): string {
  try {
    return JSON.stringify(String(text)).slice(1, -1)
  } catch {
    return ''
  }
}

const INSTITUTIONAL_KEYWORDS = [
  'horario',
  'horário',
  'hours',
  'abre',
  'fecha',
  'funcionamento',
  'expediente',
  'open',
  'close',
  'atendimento',
  'sobre',
  'about',
  'empresa',
  'company',
  'quem',
  'história',
  'history',
  'missão',
  'visão',
  'valores',
  'quem somos',
  'endereço',
  'address',
  'localização',
  'location',
  'onde',
  'rua',
  'cep',
  'telefone',
  'phone',
  'contato',
  'contact',
  'email',
  'e-mail',
  'whatsapp',
  'wpp',
  'política',
  'policy',
  'termos',
  'terms',
  'reembolso',
  'refund',
  'troca',
  'return',
  'privacidade',
  'privacy',
  'entrega',
  'shipping',
  'frete',
  'delivery',
  'prazo',
  'envio',
  'pagamento',
  'payment',
  'cartão',
  'card',
  'pix',
  'boleto',
  'transferência',
  'stripe',
  'paypal',
  'garantia',
  'warranty',
  'ajuda',
  'help',
  'suporte',
  'support',
  'dúvida',
  'duvida',
  'cnpj',
  'cpf',
  'olá',
  'ola',
  'oi',
  'bom dia',
  'boa tarde',
  'boa noite',
  'obrigado',
  'obrigada',
]

export function isInstitutionalQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return INSTITUTIONAL_KEYWORDS.some((kw) => lower.includes(kw))
}

export function checkKeywordRelevance(
  query: string,
  keywords: Array<{ keyword: string; weight: number; is_blocking: boolean }>,
): { isBlocked: boolean; relevanceScore: number } {
  const lower = query.toLowerCase()
  let isBlocked = false
  let relevanceScore = 0
  for (const kw of keywords) {
    if (lower.includes(kw.keyword.toLowerCase())) {
      if (kw.is_blocking) isBlocked = true
      relevanceScore += kw.weight || 1.0
    }
  }
  return { isBlocked, relevanceScore }
}

export function extractProducts(rpcResult: any): any[] {
  if (!rpcResult) return []
  if (Array.isArray(rpcResult)) return rpcResult
  if (Array.isArray(rpcResult?.stock)) return rpcResult.stock
  if (Array.isArray(rpcResult?.products)) return rpcResult.products
  const arrays = Object.values(rpcResult).filter(Array.isArray)
  if (arrays.length > 0) return arrays[0] as any[]
  return []
}

export function buildProductContext(products: any[]): any[] {
  return products.slice(0, 15).map((p: any) => {
    let techInfo = p.technical_info
    try {
      if (techInfo) techInfo = JSON.parse(techInfo)
    } catch {}
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      brand: p.manufacturers?.name || p.manufacturer_name || p.manufacturer || 'N/A',
      price_usd: p.price_usd,
      image_url: p.image_url,
      description: p.description,
      technical_info: techInfo,
    }
  })
}

export function mergeProductResults(resultArrays: any[][]): any[] {
  const productMap = new Map<string, any>()
  for (const products of resultArrays) {
    for (const p of products) {
      if (p?.id && !productMap.has(p.id)) productMap.set(p.id, p)
    }
  }
  return Array.from(productMap.values())
}

export function extractEntitiesHeuristic(query: string): string[] {
  const lower = query.toLowerCase()
  const separators = [' vs ', ' versus ', ' ou ', ' comparar ', ' comparação ']
  for (const sep of separators) {
    if (lower.includes(sep)) {
      const parts = query
        .split(new RegExp(sep.trim(), 'i'))
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      if (parts.length > 1) return parts
    }
  }
  return [query]
}
