/**
 * Utilitários de correspondência avançada (fuzzy match e candidatos)
 * para a importação ScanSource e Catálogo Sony.
 *
 * Regras do produto:
 * 1. Normalização profunda de SKU:
 *    - Remover prefixos como "SONY", "MFR #", "SO"
 *    - Remover hífens, espaços, barras e caracteres especiais
 *    - Remover sufixos de kit conhecidos (ex: /K, /KIT, /B, /W, /BODY, /PKG, /1, /2, -K, etc.)
 *    - Uppercase alfanumérico limpo
 *
 * 2. Cálculo de similaridade:
 *    - Similaridade de código (Levenshtein e substring/prefixo no SKU normalizado)
 *    - Sobreposição de tokens da descrição/nome
 *    - Score combinado de 0 a 100%
 *
 * 3. Assistente de correspondências:
 *    - Retorna até 5 melhores candidatos do catálogo para cada linha não casada
 *    - Ordenados por score decrescente
 *    - Filtra candidatos com relevância mínima
 */

import { normalizeSkuKey } from '@/utils/sku-normalization'

export interface SkuCandidateMatch {
  productId: string
  productName: string
  productSku: string | null
  normalizedSku: string
  category: string | null
  currentCostUsd: number | null
  currentCurrency: string | null
  codeScore: number // 0-1
  tokenScore: number // 0-1
  totalScore: number // 0-100
  matchReason: string
}

export interface ReverseTableMatch {
  sheetRowIndex: number
  tableModel: string
  normalizedModel: string
  description: string
  priceUsdSt: number | null
  itemType: string
  codeScore: number
  tokenScore: number
  totalScore: number
  matchReason: string
}

/**
 * Lista de sufixos comuns de kit e variações em SKUs Sony e distribuidores
 */
const KIT_SUFFIXES = ['KIT', 'PKG', 'BODY', 'BUNDLE', 'ACC', 'SYS', 'K', 'B', 'W', 'S', 'C']

/**
 * Normaliza SKU removendo marca "SONY", pontuações e sufixos de kit
 */
export function normalizeSkuForSuggestion(rawSku: unknown): string {
  if (typeof rawSku !== 'string') return ''

  let text = rawSku.toUpperCase().trim()

  // Remove prefixos como SONY, MFR #, MFR, BH #, SO
  text = text.replace(/^(MFR\s*#|BH\s*#|MFR|SONY\s+|SONY\b|SO(?=[A-Z0-9]{3,}))/gi, '').trim()

  // Remove sufixos explícitos com delimitador (/K, /KIT, -K, -KIT, etc.)
  text = text.replace(/[/_-](KIT|PKG|BODY|BUNDLE|ACC|K|B|W|S|C|[0-9])$/i, '')

  // Remove caracteres não alfanuméricos
  let norm = text.replace(/[^A-Z0-9]/gi, '').trim()

  // Se ainda terminar com SONY no início da chave normalizada
  if (norm.startsWith('SONY') && norm.length > 4) {
    norm = norm.slice(4)
  }

  // Remove sufixos de kit na chave limpa se ela tiver tamanho suficiente (ex: ILMEFX30B -> ILMEFX30)
  for (const suf of KIT_SUFFIXES) {
    if (norm.endsWith(suf) && norm.length > suf.length + 3) {
      // Confere se o caractere anterior é número ou letra e deixa o tronco intacto
      norm = norm.slice(0, -suf.length)
      break
    }
  }

  return norm
}

/**
 * Distância de Levenshtein simples e otimizada
 */
export function calcLevenshtein(a: string, b: string): number {
  const an = a.length
  const bn = b.length
  if (an === 0) return bn
  if (bn === 0) return an

  const matrix: number[][] = []
  for (let i = 0; i <= bn; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substituição
          matrix[i][j - 1] + 1, // inserção
          matrix[i - 1][j] + 1, // deleção
        )
      }
    }
  }

  return matrix[bn][an]
}

/**
 * Similaridade entre dois códigos normalizados (0 a 1)
 */
export function calcCodeSimilarity(codeA: string, codeB: string): number {
  if (!codeA || !codeB) return 0
  if (codeA === codeB) return 1.0

  // Se um contém o outro
  if (codeA.includes(codeB) || codeB.includes(codeA)) {
    const minLen = Math.min(codeA.length, codeB.length)
    const maxLen = Math.max(codeA.length, codeB.length)
    return Math.max(0.75, minLen / maxLen)
  }

  // Prefixo longo comum (ex: PXWX400 e PXWX400KC)
  let commonPrefix = 0
  const maxPrefix = Math.min(codeA.length, codeB.length)
  for (let i = 0; i < maxPrefix; i++) {
    if (codeA[i] === codeB[i]) commonPrefix++
    else break
  }
  if (commonPrefix >= 4 && commonPrefix >= maxPrefix * 0.7) {
    return Math.max(0.7, commonPrefix / Math.max(codeA.length, codeB.length))
  }

  // Levenshtein
  const maxLen = Math.max(codeA.length, codeB.length)
  const dist = calcLevenshtein(codeA, codeB)
  const levRatio = Math.max(0, 1 - dist / maxLen)

  return levRatio
}

/**
 * Extrai tokens limpos ignorando stop words curtas
 */
export function extractSignificantTokens(text: string): string[] {
  if (!text) return []
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && t !== 'SONY' && t !== 'PARA' && t !== 'WITH' && t !== 'AND')
}

/**
 * Calcula sobreposição de tokens de texto (descrição vs nome do produto)
 */
export function calcTokenOverlap(descA: string, descB: string): number {
  const tokensA = extractSignificantTokens(descA)
  const tokensB = new Set(extractSignificantTokens(descB))

  if (tokensA.length === 0 || tokensB.size === 0) return 0

  let matches = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      matches++
    } else {
      // Checa prefixos de tokens técnicos (ex: CAMCORDER / CAMCORDERS)
      for (const tb of tokensB) {
        if ((t.length >= 4 && tb.startsWith(t)) || (tb.length >= 4 && t.startsWith(tb))) {
          matches += 0.8
          break
        }
      }
    }
  }

  return Math.min(1.0, matches / Math.max(1, Math.min(tokensA.length, tokensB.size)))
}

/**
 * Calcula o score geral e motivo da correspondência entre linha da planilha e produto do catálogo
 */
export function scoreMatchCandidate(
  tableModel: string,
  tableDescription: string,
  catalogSku: string | null,
  catalogName: string,
): { totalScore: number; codeScore: number; tokenScore: number; reason: string } {
  // 1. Chaves normais básicas (alfanumérico sem pontuação)
  const baseTableNorm = normalizeSkuKey(tableModel)
  const baseCatalogNorm = normalizeSkuKey(catalogSku)

  // 2. Chaves com normalização profunda (sem SONY, sem sufixos de kit)
  const deepTableNorm = normalizeSkuForSuggestion(tableModel)
  const deepCatalogNorm = normalizeSkuForSuggestion(catalogSku || catalogName)

  // Código direto exato
  if (baseTableNorm && baseCatalogNorm && baseTableNorm === baseCatalogNorm) {
    return {
      totalScore: 100,
      codeScore: 1.0,
      tokenScore: 1.0,
      reason: 'Código alfanumérico idêntico',
    }
  }

  // Código profundo exato (ex: variação de kit ou prefixo SONY)
  if (deepTableNorm && deepCatalogNorm && deepTableNorm === deepCatalogNorm) {
    return {
      totalScore: 95,
      codeScore: 0.95,
      tokenScore: 0.9,
      reason: 'Código correspondente após normalização de kit/prefixo',
    }
  }

  // 3. Similaridade de código
  const rawCodeSim = Math.max(
    calcCodeSimilarity(baseTableNorm, baseCatalogNorm),
    calcCodeSimilarity(deepTableNorm, deepCatalogNorm),
  )

  // 4. Sobreposição de tokens da descrição/nome
  const tokenSim = calcTokenOverlap(tableDescription || tableModel, catalogName)

  // 5. Score ponderado (código tem peso 70%, tokens 30%)
  const weighted = rawCodeSim * 0.7 + tokenSim * 0.3
  const totalScore = Math.round(weighted * 100)

  let reason = 'Similaridade aproximada de código e descrição'
  if (rawCodeSim >= 0.85) {
    reason = `SKU similar (${Math.round(rawCodeSim * 100)}%)`
  } else if (rawCodeSim >= 0.7 && tokenSim >= 0.5) {
    reason = `SKU e descrição com alta sobreposição`
  } else if (tokenSim >= 0.7) {
    reason = `Descrição técnica fortemente compatível (${Math.round(tokenSim * 100)}%)`
  }

  return {
    totalScore,
    codeScore: rawCodeSim,
    tokenScore: tokenSim,
    reason,
  }
}

/**
 * Encontra os até 5 melhores candidatos do catálogo para uma linha não casada da tabela
 */
export function findTopCandidatesForUnmatchedRow(
  tableModel: string,
  tableDescription: string,
  catalogProducts: Array<{
    id: string
    name: string
    sku: string | null
    normalizedSku: string
    category: string | null
    price_nationalized_cost: number | null
    price_nationalized_currency: string | null
  }>,
  maxResults = 5,
): SkuCandidateMatch[] {
  if (!tableModel && !tableDescription) return []

  const scoredList: SkuCandidateMatch[] = []

  for (const prod of catalogProducts) {
    const { totalScore, codeScore, tokenScore, reason } = scoreMatchCandidate(
      tableModel,
      tableDescription,
      prod.sku,
      prod.name,
    )

    // Relevância mínima para ser sugerido como candidato viável
    if (totalScore >= 35 || codeScore >= 0.6) {
      scoredList.push({
        productId: prod.id,
        productName: prod.name,
        productSku: prod.sku,
        normalizedSku: prod.normalizedSku,
        category: prod.category,
        currentCostUsd: prod.price_nationalized_cost,
        currentCurrency: prod.price_nationalized_currency,
        codeScore,
        tokenScore,
        totalScore,
        matchReason: reason,
      })
    }
  }

  // Ordena por maior totalScore, desempatando por codeScore
  scoredList.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return b.codeScore - a.codeScore
  })

  return scoredList.slice(0, maxResults)
}

/**
 * Encontra linhas da tabela com SKU similar para um produto ausente do catálogo (Vinculação Reversa)
 */
export function findSimilarTableRowsForCatalogProduct(
  catalogSku: string | null,
  catalogName: string,
  tableRows: Array<{
    rowIndex: number
    model: string
    normalizedModel: string
    description: string
    priceUsdSt: number | null
    itemType: string
    isAnomaly?: boolean
  }>,
  maxResults = 3,
): ReverseTableMatch[] {
  if (!catalogSku && !catalogName) return []

  const matches: ReverseTableMatch[] = []

  for (const row of tableRows) {
    if (row.isAnomaly) continue

    const { totalScore, codeScore, tokenScore, reason } = scoreMatchCandidate(
      row.model,
      row.description,
      catalogSku,
      catalogName,
    )

    if (totalScore >= 40 || codeScore >= 0.65) {
      matches.push({
        sheetRowIndex: row.rowIndex,
        tableModel: row.model,
        normalizedModel: row.normalizedModel,
        description: row.description,
        priceUsdSt: row.priceUsdSt,
        itemType: row.itemType,
        codeScore,
        tokenScore,
        totalScore,
        matchReason: reason,
      })
    }
  }

  matches.sort((a, b) => b.totalScore - a.totalScore)
  return matches.slice(0, maxResults)
}
