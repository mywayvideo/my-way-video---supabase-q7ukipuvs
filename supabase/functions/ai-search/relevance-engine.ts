// ── Domain-agnostic relevance scoring and filtering for ai-search ──

export interface QueryAnalysis {
  rawQuery: string
  intent: string
  allTokens: string[]
  objectTokens: string[]
  qualifierTokens: string[]
  compoundTypeTokens?: string[]
}

export interface ScoredProduct {
  product: any
  score: number
  matchedObjectTokens: string[]
  matchedQualifierTokens: string[]
  coreMatches: string[]
  descMatches: string[]
  categoryCompatible: boolean
}

/**
 * Normalizes text removing accents, punctuation and excess whitespace.
 */
export function normalizeToken(t: string): string {
  if (!t) return ''
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
}

/**
 * Breaks a product name into:
 * - coreName: the primary product title before parentheses / brackets / dashes describing features
 * - embeddedDesc: the description or notes embedded after '(' or '[' or ' - '
 */
export function splitCoreAndDescription(rawName: string): {
  coreName: string
  embeddedDesc: string
} {
  if (!rawName) return { coreName: '', embeddedDesc: '' }

  const trimmed = rawName.trim()

  // Match parenthetical or bracketed descriptions, e.g. "Name (description with details)"
  const parenMatch = trimmed.match(/^([^({\[]+)(?:[(\[{\]]+(.+)[)\]}]+)?$/)
  let core = parenMatch ? parenMatch[1].trim() : trimmed
  let desc = parenMatch && parenMatch[2] ? parenMatch[2].trim() : ''

  // If there's an embedded dash separator like "Name - Subtitle / description"
  if (!desc && core.includes(' - ')) {
    const parts = core.split(' - ')
    core = parts[0].trim()
    desc = parts.slice(1).join(' - ').trim()
  }

  return {
    coreName: normalizeToken(core),
    embeddedDesc: normalizeToken(desc),
  }
}

/**
 * Checks if a token is a qualifier/specification (e.g. 4k, 20x, 12g, 60p, sfp+, 1080p, 50mm, 120fps, usb-c, etc.)
 * Dynamically detects numbers with units or standalone technical specs.
 */
export function isQualifierToken(token: string): boolean {
  if (!token) return false
  const t = token.toLowerCase().trim()

  // Numbers with units: 4k, 8k, 20x, 10x, 12g, 3g, 6g, 60p, 50p, 24p, 30fps, 60fps, 120hz, 1080p, 720p, 4k60, 4k30
  if (/^\d+[a-z]+$/i.test(t)) return true
  // Standalone numbers or dimensions: 20, 4, 12, 1080, 2160
  if (/^\d+$/.test(t)) return true
  // Technical specs with units or symbols: sfp+, sfp, 12g-sdi, 3g-sdi, hd-sdi, usb-c, wifi, poe, poe+, ndi, ndihx
  if (
    /^(sfp\+?|sdi|hdmi|usb-?c?|poe\+?|ndi|ndihx2?|ip|hdr|uhd|fhd|raw|dci|bt2020|rec709)$/i.test(t)
  )
    return true

  // Multi-word specification terms injected by classifier or domain:
  // e.g. "optical", "optico", "optica", "zoom", "servo", "digital", "analog", "analogico", "fluid", "fluido"
  if (
    /^(optico|optica|optical|zoom|servo|digital|analog|analogico|fluid|fluido|manual|motorized|motorizado)$/i.test(
      t,
    )
  )
    return true

  return false
}

/**
 * Checks if a multi-word phrase is a generic domain label (e.g. "audiovisual equipment", "equipamento audiovisual")
 * which must be discarded from scoring rather than treated as an object.
 */
export function isGenericDomainLabel(phrase: string): boolean {
  if (!phrase) return false
  const p = normalizeToken(phrase)
  return (
    p === 'audiovisual equipment' ||
    p === 'equipamento audiovisual' ||
    p === 'equipamentos audiovisuais' ||
    p === 'audio video equipment' ||
    p === 'equipamento profissional' ||
    p === 'professional equipment'
  )
}

/**
 * Checks if a phrase is a multi-word specification phrase (e.g. "optical zoom", "zoom optico", "servo lens", "fluid head")
 */
export function isSpecPhrase(phrase: string): boolean {
  if (!phrase) return false
  const p = normalizeToken(phrase)
  return (
    p.includes('optical zoom') ||
    p.includes('zoom optico') ||
    p.includes('zoom optical') ||
    p.includes('digital servo') ||
    p.includes('fluid head') ||
    p.includes('cabeca fluida')
  )
}

/**
 * Dynamically derives object tokens vs qualifier tokens:
 * (A) TOKENS-OBJETO só derivam do TIPO DE PRODUTO detectado na query.
 * Tokens extraídos de frases de especificação multi-palavra injetadas pelo classificador
 * (ex. 'optical zoom' -> 'zoom', 'otico') e de etiquetas genéricas de domínio
 * (ex. 'audiovisual equipment') são SEMPRE qualificadores ou descartados, jamais objetos.
 * (C) TIPO COMPOSTO: palavras adjacentes na query que qualificam o tipo (ex. 'camera ptz')
 * formam um tipo composto único.
 */
export function analyzeQueryTokens(
  query: string,
  searchEntities: string[] = [],
  intent: string = 'catalog',
): QueryAnalysis {
  const normalizedQuery = normalizeToken(query)
  const rawWords = normalizedQuery.split(/\s+/).filter((w) => w.length > 1)

  const stopWords = new Set([
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
    'um',
    'uma',
    'uns',
    'umas',
    'o',
    'a',
    'os',
    'as',
    'e',
    'ou',
    'mas',
    'como',
    'se',
    'me',
    'meu',
    'minha',
    'quero',
    'preciso',
    'gostaria',
    'procuro',
    'busco',
    'ver',
    'tem',
    'tenho',
    'onde',
    'quando',
    'sobre',
    'este',
    'esta',
    'esse',
    'essa',
    'aquele',
    'aquela',
    'mais',
    'menos',
    'muito',
    'profissa',
    'profissional',
    'melhor',
  ])

  // Split query into tokens while preserving query-word order
  const cleanWords = rawWords.filter((w) => !stopWords.has(w) && w.length >= 2)

  // Identify spec words from query or entities that should NEVER be object tokens
  // E.g. 'optical zoom' -> 'zoom', 'optico', 'optical'
  const specWords = new Set<string>()
  const discardedDomainWords = new Set<string>()

  // Process searchEntities / classifier terms
  for (const entity of searchEntities || []) {
    const normEntity = normalizeToken(entity)
    if (!normEntity) continue

    if (isGenericDomainLabel(normEntity)) {
      // Discard all words of generic domain labels (e.g. 'audiovisual equipment')
      normEntity.split(/\s+/).forEach((w) => {
        if (w.length >= 2) discardedDomainWords.add(w)
      })
      continue
    }

    if (isSpecPhrase(normEntity)) {
      // Spec phrase words are always qualifiers, never objects
      normEntity.split(/\s+/).forEach((w) => {
        if (w.length >= 2 && !stopWords.has(w)) specWords.add(w)
      })
      continue
    }

    // Check if standalone entity token is a qualifier or spec word
    for (const word of normEntity.split(/\s+/)) {
      if (isQualifierToken(word) && !stopWords.has(word) && word.length >= 2) {
        specWords.add(word)
      }
    }
  }

  // Also check query words against qualifier / spec patterns
  for (const word of cleanWords) {
    if (isQualifierToken(word)) {
      specWords.add(word)
    }
  }

  // Derive object tokens:
  // ONLY product-type words from query (or non-spec/non-discarded entities if accessory/spec intent)
  const objectTokens: string[] = []
  const qualifierTokens: string[] = []

  // If query is accessory intent, words like 'controle' / 'suporte' can be objects.
  for (const word of cleanWords) {
    if (discardedDomainWords.has(word)) continue
    if (specWords.has(word) || isQualifierToken(word)) {
      if (!qualifierTokens.includes(word)) qualifierTokens.push(word)
    } else {
      if (!objectTokens.includes(word)) objectTokens.push(word)
    }
  }

  // Add remaining searchEntities that were not in cleanWords
  for (const entity of searchEntities || []) {
    const normEntity = normalizeToken(entity)
    if (!normEntity || isGenericDomainLabel(normEntity)) continue

    const words = normEntity.split(/\s+/).filter((w) => !stopWords.has(w) && w.length >= 2)
    for (const w of words) {
      if (discardedDomainWords.has(w)) continue
      if (specWords.has(w) || isQualifierToken(w)) {
        if (!qualifierTokens.includes(w)) qualifierTokens.push(w)
      } else {
        // Only add as object token if query didn't already have object tokens,
        // or if it's not a generic catalog search
        if (intent === 'accessory' || intent === 'compatibility' || objectTokens.length === 0) {
          if (!objectTokens.includes(w)) objectTokens.push(w)
        } else {
          // In catalog search, external entities that are not in the query are treated as qualifiers
          if (!qualifierTokens.includes(w)) qualifierTokens.push(w)
        }
      }
    }
  }

  // Detect compound type: adjacent object tokens in cleanWords (e.g. 'camera' + 'ptz' -> ['camera', 'ptz'])
  // Or 'conversor' + 'fibra' -> ['conversor', 'fibra']
  const compoundTypeTokens: string[] = []
  for (let i = 0; i < cleanWords.length - 1; i++) {
    const w1 = cleanWords[i]
    const w2 = cleanWords[i + 1]
    if (objectTokens.includes(w1) && objectTokens.includes(w2)) {
      if (!compoundTypeTokens.includes(w1)) compoundTypeTokens.push(w1)
      if (!compoundTypeTokens.includes(w2)) compoundTypeTokens.push(w2)
    }
  }

  const allTokensList = Array.from(new Set([...objectTokens, ...qualifierTokens]))

  return {
    rawQuery: query,
    intent,
    allTokens: allTokensList,
    objectTokens,
    qualifierTokens,
    compoundTypeTokens: compoundTypeTokens.length > 1 ? compoundTypeTokens : undefined,
  }
}

/**
 * Checks if a token matches within a text (whole word or prefix match for singular/plural).
 */
export function tokenMatchesText(token: string, text: string): boolean {
  if (!token || !text) return false
  const t = normalizeToken(token)
  const normText = normalizeToken(text)
  if (!t || !normText) return false

  // Direct word boundary or substring boundary check
  const words = normText.split(/\s+/)
  return words.some((word) => {
    if (word === t) return true
    // Singular/plural or compound matches (e.g. camera / cameras, conversor / conversores)
    if (t.length >= 4 && (word.startsWith(t) || t.startsWith(word))) return true
    return false
  })
}

/**
 * Checks if a category name is an accessory, support, bracket, cable, or parts category:
 * Generic across all catalog segments (Accessories, Suporte, Mount, Bracket, Cabo, etc.)
 */
export function isAccessoryOrSupportCategory(rawCategory: string): boolean {
  if (!rawCategory) return false
  const norm = normalizeToken(rawCategory)
  const accessoryKeywords = [
    'accessori', // accessories, acessorios, acessorio, accessory
    'suporte',
    'bracket',
    'mount',
    'plate',
    'cabo',
    'cable',
    'case',
    'bolsa',
    'bag',
    'strap',
    'alca',
    'parasol',
    'tampa',
    'cover',
    'adaptador',
    'adapter',
    'placa',
  ]
  return accessoryKeywords.some((kw) => norm.includes(kw))
}

/**
 * Dynamic category compatibility check:
 * Compares the query's object tokens against the product's taxonomy/category.
 * If the product has a category:
 * - If the query is looking for a primary product type (like camera, switcher, conversor, tripe, etc.)
 *   and the product's category is an accessory / support category (Accessories, Suporte, Bracket, Mount, etc.),
 *   it is clearly incompatible.
 * - Otherwise, tests if any query object token matches the category name, or category tokens match object tokens.
 */
export function checkCategoryCompatibility(product: any, analysis: QueryAnalysis): boolean {
  const rawCat = (product.category || product.category_name || '').trim()
  if (!rawCat) {
    // If product has no category assigned in catalog, don't penalize it here
    return true
  }

  const normCat = normalizeToken(rawCat)
  const catTokens = normCat.split(/\s+/).filter((w) => w.length >= 3)

  // If query intent is catalog and has object tokens:
  // Check if product is categorized as accessory/support while query is looking for primary equipment
  if (analysis.intent === 'catalog' || analysis.intent === 'categorizar' || !analysis.intent) {
    const isPrimaryQuery = analysis.objectTokens.some((obj) => !isAccessoryOrSupportCategory(obj))
    if (isPrimaryQuery && isAccessoryOrSupportCategory(rawCat)) {
      return false
    }
  }

  // If any query object token matches the category text
  const matchInCat = analysis.objectTokens.some((obj) => tokenMatchesText(obj, normCat))
  if (matchInCat) return true

  // Or if any token from the product category matches any query object token
  const matchFromCat = catTokens.some((catT) =>
    analysis.objectTokens.some((obj) => tokenMatchesText(catT, obj)),
  )
  if (matchFromCat) return true

  return false
}

/**
 * Calculates a generic relevance score for a product based on query analysis:
 * - Object tokens matching in coreName: +10 points each
 * - Object tokens matching in embeddedDesc: +3 points each
 * - Qualifier tokens matching in coreName: +3 points each
 * - Qualifier tokens matching in embeddedDesc: +1 point each
 * - Category compatibility bonus: +5 points
 */
export function scoreProductRelevance(product: any, analysis: QueryAnalysis): ScoredProduct {
  const rawName = product.name || product.nome || ''
  const { coreName, embeddedDesc } = splitCoreAndDescription(rawName)

  let score = 0
  const matchedObjectTokens: string[] = []
  const matchedQualifierTokens: string[] = []
  const coreMatches: string[] = []
  const descMatches: string[] = []

  for (const obj of analysis.objectTokens) {
    const inCore = tokenMatchesText(obj, coreName)
    const inDesc = tokenMatchesText(obj, embeddedDesc)

    if (inCore) {
      score += 10
      matchedObjectTokens.push(obj)
      coreMatches.push(obj)
    } else if (inDesc) {
      score += 3
      matchedObjectTokens.push(obj)
      descMatches.push(obj)
    }
  }

  for (const qual of analysis.qualifierTokens) {
    const inCore = tokenMatchesText(qual, coreName)
    const inDesc = tokenMatchesText(qual, embeddedDesc)

    if (inCore) {
      score += 3
      matchedQualifierTokens.push(qual)
      coreMatches.push(qual)
    } else if (inDesc) {
      score += 1
      matchedQualifierTokens.push(qual)
      descMatches.push(qual)
    }
  }

  const categoryCompatible = checkCategoryCompatibility(product, analysis)
  if (categoryCompatible && matchedObjectTokens.length > 0) {
    score += 5
  }

  return {
    product,
    score,
    matchedObjectTokens: Array.from(new Set(matchedObjectTokens)),
    matchedQualifierTokens: Array.from(new Set(matchedQualifierTokens)),
    coreMatches: Array.from(new Set(coreMatches)),
    descMatches: Array.from(new Set(descMatches)),
    categoryCompatible,
  }
}

export interface UnifiedFilterOptions {
  minResults?: number
  minScore?: number
  requireObjectToken?: boolean
}

/**
 * Unified filter with graceful degradation:
 * - Stage 1 (strict): Product must have >=1 object token match AND score >= minScore,
 *   AND for intent=catalog, category must be compatible OR product has >=1 object token in coreName.
 * - Stage 2 (relaxed category): If results < minResults, relax category restriction.
 * - Stage 3 (relaxed score): If results < minResults, lower minScore requirement (score >= 1).
 * - Stage 4 (fallback): If still < minResults, keep original list to NEVER return empty due to filter.
 */
export function applyUnifiedRelevanceFilter(
  products: any[],
  analysis: QueryAnalysis,
  options: UnifiedFilterOptions = {},
): { filtered: any[]; scored: ScoredProduct[]; stageUsed: string } {
  if (!products || products.length === 0) {
    return { filtered: [], scored: [], stageUsed: 'empty_input' }
  }

  const minResults = options.minResults ?? 3
  const minScore = options.minScore ?? 6

  // Score all products first
  const scoredProducts = products.map((p) => scoreProductRelevance(p, analysis))

  // Sort descending by score initially
  scoredProducts.sort((a, b) => b.score - a.score)

  // If no object tokens were detected in query, return original set sorted by score
  if (analysis.objectTokens.length === 0) {
    return {
      filtered: scoredProducts.map((sp) => sp.product),
      scored: scoredProducts,
      stageUsed: 'no_object_tokens',
    }
  }

  // Preserve current behavior for accessory / compatibility / comparison
  const isCatalog =
    analysis.intent === 'catalog' || analysis.intent === 'categorizar' || !analysis.intent

  // Stage 1: Strict filter
  const stage1 = scoredProducts.filter((sp) => {
    // Must have at least 1 object token matched
    if (sp.matchedObjectTokens.length === 0) return false
    // Must reach minimum score
    if (sp.score < minScore) return false

    if (isCatalog) {
      // (B) PRECEDÊNCIA DE CATEGORIA em intent=catalog:
      // Se a categoria do produto é claramente incompatível com o tipo detectado (ex. Accessories/suporte
      // quando o tipo é câmera PTZ), o produto é ELIMINADO no estágio strict MESMO que contenha token-objeto
      // no nome-core — o match de token NÃO salva categoria incompatível.
      const rawCat = (sp.product.category || sp.product.category_name || '').trim()
      if (rawCat && !sp.categoryCompatible) {
        return false
      }

      // (C) TIPO COMPOSTO:
      // Se a query tem um tipo composto (ex. ['camera', 'ptz']), o produto DEVE ter o qualificador do composto
      // no nome-core (ou na categoria) para sobreviver no estágio strict.
      // Se não tiver todos os tokens do composto no nome-core, só sobrevive nos estágios relaxed.
      if (analysis.compoundTypeTokens && analysis.compoundTypeTokens.length > 1) {
        const hasAllCompoundInCore = analysis.compoundTypeTokens.every((ct) =>
          sp.coreMatches.includes(ct),
        )
        if (!hasAllCompoundInCore) {
          return false
        }
      }

      // In catalog search: category compatible OR object token matches in coreName
      const hasCoreObject = sp.coreMatches.some((t) => analysis.objectTokens.includes(t))
      return sp.categoryCompatible || hasCoreObject
    }

    return true
  })

  if (stage1.length >= minResults) {
    return {
      filtered: stage1.map((sp) => sp.product),
      scored: stage1,
      stageUsed: 'strict',
    }
  }

  // Stage 2: Relax category constraint
  const stage2 = scoredProducts.filter((sp) => {
    if (sp.matchedObjectTokens.length === 0) return false
    return sp.score >= minScore
  })

  if (stage2.length >= minResults) {
    return {
      filtered: stage2.map((sp) => sp.product),
      scored: stage2,
      stageUsed: 'relaxed_category',
    }
  }

  // Stage 3: Relax score constraint (any object match, score >= 1)
  const stage3 = scoredProducts.filter((sp) => {
    return sp.matchedObjectTokens.length > 0 || sp.score > 0
  })

  if (stage3.length >= minResults) {
    return {
      filtered: stage3.map((sp) => sp.product),
      scored: stage3,
      stageUsed: 'relaxed_score',
    }
  }

  // Stage 4: Graceful degradation fallback — never return empty due to filter
  return {
    filtered: scoredProducts.map((sp) => sp.product),
    scored: scoredProducts,
    stageUsed: 'graceful_fallback',
  }
}

/**
 * Balanced curation with pre-sorting by relevance score:
 * Sorts products by relevance score BEFORE manufacturer round-robin,
 * ensuring high-relevance candidates of each manufacturer are picked first,
 * and low-scoring intruders are dropped.
 */
export function balanceProductsByManufacturer(
  scoredProducts: ScoredProduct[],
  maxPerManufacturer: number = 2,
  maxTotalCards: number = 10,
): any[] {
  if (!scoredProducts || scoredProducts.length === 0) return []

  // Ensure products are sorted by score descending before grouping
  const sorted = [...scoredProducts].sort((a, b) => b.score - a.score)

  const productsByManufacturer = new Map<string, any[]>()

  for (const item of sorted) {
    const product = item.product
    const mfr = (
      product.manufacturers?.name ||
      product.manufacturer ||
      product.brand ||
      'Outros'
    ).trim()

    if (!productsByManufacturer.has(mfr)) {
      productsByManufacturer.set(mfr, [])
    }
    productsByManufacturer.get(mfr)!.push(product)
  }

  const manufacturerEntries = Array.from(productsByManufacturer.entries())
  // Sort manufacturers by quantity of candidates available
  manufacturerEntries.sort((a, b) => b[1].length - a[1].length)

  const balancedProducts: any[] = []
  let idx = 0
  let allExhausted = false

  while (balancedProducts.length < maxTotalCards && !allExhausted) {
    allExhausted = true
    for (const [mfr, products] of manufacturerEntries) {
      if (idx < products.length && balancedProducts.length < maxTotalCards) {
        const countForBrand = balancedProducts.filter(
          (p) => (p.manufacturer || p.brand || p.manufacturers?.name || 'Outros').trim() === mfr,
        ).length
        if (countForBrand < maxPerManufacturer) {
          balancedProducts.push(products[idx])
          allExhausted = false
        }
      }
    }
    idx++
  }

  return balancedProducts
}
