/**
 * Parser e utilitários especializados na tabela de preços Sony ScanSource.
 *
 * LAYOUT:
 * - Aba alvo padrão: "DEALERListPrice" (ou primeira aba caso o nome varie)
 * - Cabeçalho nas primeiras linhas:
 *     - Linha 1, Coluna B: Data de vigência ex.: "DEALER LIST PRICE (JAN 2nd 2025)"
 *     - Coluna C (3ª): Sem ST
 *     - Coluna D (4ª): "Preços em US$ para os seguintes Estados: GO, AC, AP, DF, DF, PB, PR, RJ e SE (Considerando ST quando houver)" -> COLUNA ALVO
 * - Linhas de dados:
 *     - Coluna A (1ª, idx 0): MODEL (ex.: PXWX400KC, XVSG1)
 *     - Coluna B (2ª, idx 1): Descrição
 *     - Coluna D (4ª, idx 3): Preço com ST em USD
 *     - Coluna I (9ª, idx 8): NCM Sugerida (ex.: 85437099)
 *     - Coluna R (18ª, idx 17): Tipo HW/SW (e 3RD para third-party vendor)
 *
 * REGRAS CRÍTICAS:
 * - Preços arredondados para 2 casas decimais (ex.: 13233.02989 -> 13233.03)
 * - SW entra normalmente (atualiza preço de custo como HW)
 * - 3RD é descartado da importação (apenas contado: "X linhas 3RD ignoradas")
 * - Preço zerado ou coluna D vazia -> Anomalia (não zera custo existente)
 */

import { parseXlsxWorkbook, ParsedWorksheet } from './xlsx-native-parser'

export interface ScanSourceParsedRow {
  rowIndex: number
  model: string
  normalizedModel: string
  description: string
  priceUsdSt: number | null
  rawPriceUsdSt: number | string | null
  ncmSuggested: string
  itemType: 'HW' | 'SW' | '3RD' | string
  is3rdParty: boolean
  isSoftware: boolean
  isAnomaly: boolean
  anomalyReason?: string
}

export interface ScanSourceParseResult {
  sheetName: string
  effectiveDate: string
  totalRowsFound: number
  dataRows: ScanSourceParsedRow[]
  validRows: ScanSourceParsedRow[]
  ignored3rdCount: number
  softwareCount: number
  hardwareCount: number
  anomalyRows: ScanSourceParsedRow[]
}

/**
 * Arredonda um número para 2 casas decimais
 */
export function roundToTwoDecimals(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100
}

/**
 * Extrai a data de vigência do cabeçalho da planilha
 * Procura padrões como "JAN 2nd 2025" ou "DEALER LIST PRICE (JAN 2nd 2025)"
 */
export function extractEffectiveDate(rows: (string | number | null)[][]): string {
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = rows[r] || []
    for (let c = 0; c < Math.min(row.length, 5); c++) {
      const cell = String(row[c] || '').trim()
      if (cell.toUpperCase().includes('DEALER LIST PRICE') || cell.toUpperCase().includes('JAN')) {
        const parenMatch = cell.match(/\(([^)]+)\)/)
        if (parenMatch && parenMatch[1].trim()) {
          return parenMatch[1].trim()
        }
        const dateMatch = cell.match(/([A-Z]{3,}\s+\d+(?:st|nd|rd|th)?\s+\d{4})/i)
        if (dateMatch) {
          return dateMatch[1].trim()
        }
      }
    }
  }
  return 'JAN 2nd 2025'
}

/**
 * Limpa e padroniza NCM vindo da planilha
 */
export function cleanNcm(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const str = String(raw).trim().replace(/[^\d]/g, '')
  if (str.length === 8) {
    return `${str.slice(0, 4)}.${str.slice(4, 6)}.${str.slice(6, 8)}`
  }
  return str
}

/**
 * Normaliza número vindo de célula Excel (suporta string com vírgula ou float nativo)
 */
export function parseExcelPrice(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') {
    if (isNaN(val)) return null
    return roundToTwoDecimals(val)
  }
  const str = String(val).trim()
  if (!str) return null

  // Remove símbolos de moeda
  const cleaned = str.replace(/[R$US$\s]/g, '')
  // Trata formato brasileiro (1.234,56) vs internacional (1,234.56)
  let normalized = cleaned
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.')
  }

  const num = parseFloat(normalized)
  if (isNaN(num)) return null
  return roundToTwoDecimals(num)
}

/**
 * Parseia a planilha ScanSource a partir do ArrayBuffer
 */
export async function parseScanSourceXlsx(buffer: ArrayBuffer): Promise<ScanSourceParseResult> {
  const worksheets = await parseXlsxWorkbook(buffer)
  if (worksheets.length === 0) {
    throw new Error('Nenhuma aba encontrada no arquivo XLSX')
  }

  // Tenta encontrar a aba DEALERListPrice (case-insensitive e tolerante a espaços)
  let targetSheet: ParsedWorksheet = worksheets[0]
  for (const ws of worksheets) {
    const cleanName = ws.sheetName.replace(/\s+/g, '').toLowerCase()
    if (cleanName.includes('dealerlistprice') || cleanName.includes('dealer')) {
      targetSheet = ws
      break
    }
  }

  const rows = targetSheet.rows
  const effectiveDate = extractEffectiveDate(rows)

  // Detectar onde começam as linhas de dados:
  // Primeira linha onde a coluna A tem modelo (texto não vazio diferente de "MODEL" e "DEALER")
  // e a coluna D tem um valor numérico ou de preço
  let startRowIndex = -1

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || []
    const colA = String(row[0] || '')
      .trim()
      .toUpperCase()
    const colD = row[3]

    if (
      colA &&
      !colA.includes('DEALER') &&
      !colA.includes('MODEL') &&
      colA !== 'MODELO' &&
      colA !== 'CODIGO' &&
      colA !== 'CÓDIGO'
    ) {
      const price = parseExcelPrice(colD)
      if (price !== null && price > 0) {
        startRowIndex = r
        break
      }
    }
  }

  if (startRowIndex === -1) {
    // Fallback: se não detectou pelas primeiras 15 linhas, assume linha 4 (base zero = 4, 5ª linha física)
    startRowIndex = 4
  }

  const dataRows: ScanSourceParsedRow[] = []
  const validRows: ScanSourceParsedRow[] = []
  const anomalyRows: ScanSourceParsedRow[] = []
  let ignored3rdCount = 0
  let softwareCount = 0
  let hardwareCount = 0

  for (let r = startRowIndex; r < rows.length; r++) {
    const row = rows[r] || []
    const rawModel = String(row[0] || '').trim()

    // Tolera linhas completamente vazias
    if (!rawModel && (!row[1] || String(row[1]).trim() === '') && !row[3]) {
      continue
    }

    const description = String(row[1] || '').trim()
    const rawPrice = row[3]
    const priceUsdSt = parseExcelPrice(rawPrice)
    const rawNcm = row[8]
    const ncmSuggested = cleanNcm(rawNcm)
    const rawType = String(row[17] || '')
      .trim()
      .toUpperCase()

    const itemType = rawType || 'HW'
    const is3rdParty = itemType === '3RD' || itemType.includes('3RD') || itemType.includes('THIRD')
    const isSoftware = itemType === 'SW' || itemType.includes('SW') || itemType.includes('SOFTWARE')

    // Normalização alfanumérica de SKU
    const normalizedModel = rawModel
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim()

    // Validação de anomalias:
    // Preço zerado, ausente ou negativo NÃO atualiza e vai para anomalias
    let isAnomaly = false
    let anomalyReason: string | undefined

    if (!rawModel) {
      isAnomaly = true
      anomalyReason = 'Linha sem código MODEL'
    } else if (priceUsdSt === null) {
      isAnomaly = true
      anomalyReason = 'Preço na Coluna D ausente ou inválido'
    } else if (priceUsdSt <= 0) {
      isAnomaly = true
      anomalyReason = `Preço na Coluna D zerado ou negativo (US$ ${priceUsdSt})`
    }

    const parsedRow: ScanSourceParsedRow = {
      rowIndex: r + 1,
      model: rawModel,
      normalizedModel,
      description,
      priceUsdSt,
      rawPriceUsdSt: rawPrice ?? null,
      ncmSuggested,
      itemType,
      is3rdParty,
      isSoftware,
      isAnomaly,
      anomalyReason,
    }

    dataRows.push(parsedRow)

    if (isAnomaly) {
      anomalyRows.push(parsedRow)
      continue
    }

    if (is3rdParty) {
      ignored3rdCount++
      // Linhas 3RD são descartadas da importação (apenas contadas no relatório)
      continue
    }

    if (isSoftware) {
      softwareCount++
    } else {
      hardwareCount++
    }

    validRows.push(parsedRow)
  }

  return {
    sheetName: targetSheet.sheetName,
    effectiveDate,
    totalRowsFound: dataRows.length,
    dataRows,
    validRows,
    ignored3rdCount,
    softwareCount,
    hardwareCount,
    anomalyRows,
  }
}
