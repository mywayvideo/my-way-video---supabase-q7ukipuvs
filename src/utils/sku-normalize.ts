/**
 * Utilitário central de normalização de SKU (Rodada 3 - Padronização SKU Sony).
 *
 * Expõe normalizeSonySku(sku), isSonyBrand(brand) e normalizeSkuForBrand(sku, brand),
 * reutilizando as implementações consolidadas de src/utils/sku-normalization.ts.
 */

import {
  formatSonyStandardSku,
  isSonyBrand as isSonyBrandInternal,
  normalizeSkuKey,
  normalizeBhSkuKey,
  matchBhSkuWithDatabase,
  hasSkuDash,
} from './sku-normalization'
import { sanitizeSku } from './sku-sanitizer'

/**
 * Normaliza SKU Sony:
 * - uppercase
 * - trim
 * - remove hífens/traços ("-") e espaços/caracteres não alfanuméricos
 *
 * Exemplo:
 * - "ILME-FX2" -> "ILMEFX2"
 * - "BRU-SF10" -> "BRUSF10"
 * - "  ilme-fx2  " -> "ILMEFX2"
 * - "MFR # BRU-SF10" -> "BRUSF10"
 */
export function normalizeSonySku(sku: string | null | undefined): string {
  if (!sku || typeof sku !== 'string') return ''
  return formatSonyStandardSku(sku)
}

/**
 * Verifica se a marca / fabricante informada é "Sony" (case-insensitive e trim).
 */
export function isSonyBrand(brand: unknown): boolean {
  return isSonyBrandInternal(brand)
}

/**
 * Aplica normalização apenas se a marca for Sony.
 * Se a marca não for Sony (ou não informada/nula), preserva o SKU original sanitizado
 * (mantém hífens para marcas como Blackmagic, Canon, etc.).
 *
 * @param sku - Código SKU a normalizar
 * @param brand - Nome da marca ou fabricante
 */
export function normalizeSkuForBrand(sku: string | null | undefined, brand?: unknown): string {
  if (!sku || typeof sku !== 'string') return ''
  const cleaned = sanitizeSku(sku)
  if (!cleaned) return ''

  if (isSonyBrand(brand)) {
    return normalizeSonySku(cleaned)
  }

  return cleaned.trim()
}

// Reexporta funções auxiliares essenciais para uso uniforme no projeto
export {
  normalizeSkuKey,
  normalizeBhSkuKey,
  matchBhSkuWithDatabase,
  formatSonyStandardSku,
  hasSkuDash,
  sanitizeSku,
}
