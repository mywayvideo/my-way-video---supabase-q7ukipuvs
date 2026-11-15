/**
 * Compatibilidade produto ↔ acessório (Fase 3, PROVISÓRIO).
 *
 * A tabela de compatibilidade só existe na Fase 2; enquanto isso, o selo
 * "tem acessórios" da listagem da categoria usa uma heurística de texto:
 * um acessório (is_accessory=true da MESMA categoria-mãe) é considerado
 * compatível quando o nome dele referencia o nome/modelo do produto.
 *
 * Regra: extrai do nome do produto os tokens "fortes" (com números —
 * ex.: "R6", "FX3", "12G" — e palavras distintas, ignorando genéricas) e
 * exige que o nome do acessório contenha TODOS os tokens numéricos; se o
 * produto não tem token numérico, exige os tokens fortes principais.
 */

/** Palavras genéricas que não identificam um produto. */
const STOPWORDS = new Set([
  'para',
  'com',
  'sem',
  'para',
  'the',
  'and',
  'for',
  'with',
  'new',
  'original',
  'kit',
  'set',
  'pack',
  'case',
  'bag',
  'battery',
  'batteries',
  'cable',
  'cables',
  'mount',
  'adapter',
  'adaptor',
  'lens',
  'camera',
  'video',
  'digital',
  'pro',
  'max',
  'mini',
  'plus',
  'sistema',
  'system',
  'acessorio',
  'acessório',
  'accessory',
])

/** minúsculas, sem acentos e sem pontuação. */
export function normalizarTexto(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Tokens "fortes" que identificam o produto no nome de um acessório. */
export function tokensIdentificadores(nomeProduto: string): string[] {
  const tokens = normalizarTexto(nomeProduto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const comNumero = tokens.filter((t) => /\d/.test(t) && t.length >= 2)
  if (comNumero.length > 0) return comNumero.slice(0, 4)
  const fortes = tokens.filter((t) => t.length >= 4 && !STOPWORDS.has(t))
  return fortes.sort((a, b) => b.length - a.length).slice(0, 2)
}

/** O acessório referencia o produto pela heurística de texto? */
export function acessorioReferenciaProduto(nomeAcessorio: string, nomeProduto: string): boolean {
  const tokens = tokensIdentificadores(nomeProduto)
  if (tokens.length === 0) return false
  const nomeAcc = normalizarTexto(nomeAcessorio)
  return tokens.every((t) => nomeAcc.includes(t))
}
