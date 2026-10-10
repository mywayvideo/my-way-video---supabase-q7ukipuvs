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
