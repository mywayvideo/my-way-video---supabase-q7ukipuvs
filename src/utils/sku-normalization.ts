/**
 * Utilitários de normalização e padronização de SKU para o catálogo.
 *
 * Diretriz do plano de padronização Sony:
 * 1. Chave de comparação normalizada (TODAS as marcas):
 *    - Letras maiúsculas
 *    - Sem hífens/traços ("-")
 *    - Sem espaços nem caracteres especiais não alfanuméricos
 *    Exemplo: "BRU-SF10" -> "BRUSF10", "ILME-FX2" -> "ILMEFX2", "mfr # MRW-G3" -> "MRWG3"
 *
 * 2. Padronização física de SKU Sony:
 *    - SKUs da Sony no padrão final físico ficam SEM traço ("-")
 *    - Preserva formato alfanumérico limpo
 *    - Remove prefixos residuais tipo "MFR #" se existirem
 *    - Letras em maiúsculas
 *
 * 3. Demais marcas:
 *    - Mantêm o SKU físico original (preservam traços etc.), mas usam a mesma chave normalizada
 *      para detecção de duplicidade/colisão e buscas.
 */

import { sanitizeSku } from './sku-sanitizer'

/**
 * Gera a chave normalizada de comparação para qualquer SKU e qualquer marca:
 * - Sanitiza prefixos como "MFR #"
 * - Converte para maiúsculas
 * - Remove espaços e caracteres que não sejam A-Z ou 0-9 (incluindo hífen)
 */
export function normalizeSkuKey(rawSku: unknown): string {
  if (typeof rawSku !== 'string') return ''
  const cleaned = sanitizeSku(rawSku)
  return cleaned
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

/**
 * Normaliza SKU vindo da B&H para fins de comparação com a base.
 * Além das regras de normalizeSkuKey:
 * - Se for da marca Sony ou se iniciar com o prefixo do fabricante SO ("SO" seguido de letras e números),
 *   remove opcionalmente o prefixo "SO" para equiparar ex.: BH # "SOBRUSF10" -> "BRUSF10".
 */
export function normalizeBhSkuKey(rawSku: unknown, isSony = false): string {
  if (typeof rawSku !== 'string') return ''
  const baseKey = normalizeSkuKey(rawSku)
  if (!baseKey) return ''

  if (isSony || baseKey.startsWith('SO')) {
    // Remove prefixo "SO" inicial se houver
    if (baseKey.startsWith('SO') && baseKey.length > 3) {
      return baseKey.slice(2)
    }
  }

  return baseKey
}

/**
 * Verifica se um SKU da B&H casa com um SKU do nosso banco (ambos Sony ou genérico).
 * Compara por chaves normalizadas e considera o prefixo "SO" característico da B&H para Sony.
 */
export function matchBhSkuWithDatabase(
  bhMfrOrSku: unknown,
  dbSku: unknown,
  isSony = false,
): boolean {
  const normDb = normalizeSkuKey(dbSku)
  if (!normDb) return false

  const normBh = normalizeSkuKey(bhMfrOrSku)
  if (!normBh) return false

  if (normBh === normDb) return true

  // Se Sony (ou candidato a Sony), testa sem o prefixo SO do SKU B&H
  if (isSony || normBh.startsWith('SO')) {
    const strippedBh = normalizeBhSkuKey(normBh, true)
    if (strippedBh === normDb) return true
  }

  return false
}

/**
 * Retorna se o SKU pertence fisicamente ao padrão Sony (sem traços, maiúsculo).
 */
export function formatSonyStandardSku(rawSku: unknown): string {
  if (typeof rawSku !== 'string') return ''
  const cleaned = sanitizeSku(rawSku)
  // Para Sony, remove hífens e pontuações, mantendo alfanumérico em maiúsculas
  return cleaned
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

/**
 * Função utilitária única de normalização de SKU Sony e demais marcas.
 * Aplica a normalização física se a marca for Sony:
 * - uppercase
 * - remoção de hífens / traços
 * - trim e remoção de espaços / caracteres não alfanuméricos
 * Se a marca não for Sony (ou não informada / outra marca), preserva o SKU original sanitizado (sem traço alterado).
 */
export function normalizeSonySku(rawSku: unknown, brandOrManufacturer?: unknown): string {
  if (typeof rawSku !== 'string') return ''
  const cleaned = sanitizeSku(rawSku)
  if (!cleaned) return ''

  if (isSonyBrand(brandOrManufacturer)) {
    return formatSonyStandardSku(cleaned)
  }

  return cleaned.trim()
}

/**
 * Verifica se um SKU possui traço/hífen ("-")
 */
export function hasSkuDash(rawSku: unknown): boolean {
  if (typeof rawSku !== 'string') return false
  return rawSku.includes('-')
}

/**
 * Determina se uma marca/fabricante é "Sony" (case-insensitive)
 */
export function isSonyBrand(brandOrManufacturer: unknown): boolean {
  if (!brandOrManufacturer || typeof brandOrManufacturer !== 'string') return false
  return brandOrManufacturer.trim().toLowerCase() === 'sony'
}
