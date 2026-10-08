/**
 * Utilitário de sanitização de SKU para produtos importados/extraídos.
 * Remove prefixos indesejados (como "MFR #", "MFR#", "mfr #", case-insensitive)
 * e espaços extras no início e no fim.
 *
 * Exemplos:
 * - "MFR #SEL300F28GM" -> "SEL300F28GM"
 * - "MFR#SEL300F28GM" -> "SEL300F28GM"
 * - "mfr # MRW-G3" -> "MRW-G3"
 * - "   MFR  #  SEL300F28GM  " -> "SEL300F28GM"
 * - "SEL300F28GM" -> "SEL300F28GM"
 */
export function sanitizeSku(rawSku: unknown): string {
  if (typeof rawSku !== 'string') {
    return ''
  }

  // Remove espaços extras nas extremidades
  let cleaned = rawSku.trim()

  // Remove o prefixo MFR com ou sem espaço antes/depois da cerquilha (#)
  // Ex: "MFR #", "mfr #", "MFR#", "mfr#", "MFR   # "
  cleaned = cleaned.replace(/^mfr\s*#\s*/i, '').trim()

  return cleaned
}
