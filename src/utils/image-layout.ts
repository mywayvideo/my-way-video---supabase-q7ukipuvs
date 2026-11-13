import { debugLog } from '@/utils/debug-front'
import { normalizeImageUrl } from '@/lib/image-proxy'

const HEADING_RE = /^#{1,6}\s+/
const IMG_LINE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/
const BOLD_TITLE_RE = /^\*\*[^*]+\*\*$/

function isTitleLine(trimmed: string): boolean {
  return HEADING_RE.test(trimmed) || BOLD_TITLE_RE.test(trimmed)
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texto do título sem marcadores, para comparar com o texto alternativo da imagem. */
function titleText(line: string): string {
  return normalize(
    line.trim().replace(HEADING_RE, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim(),
  )
}

function findImageInsertionPoint(section: string[]): number {
  let pos = 0
  while (pos < section.length && section[pos].trim() === '') pos++
  if (pos < section.length) {
    while (pos < section.length) {
      const t = section[pos].trim()
      if (t === '' || isTitleLine(t) || IMG_LINE_RE.test(t)) break
      pos++
    }
  }
  return pos
}

/**
 * Garante que a imagem do produto fique DENTRO da seção do próprio produto,
 * logo acima do título dele — e não empilhada no fim da resposta.
 *
 * A resposta da IA já vem assim (imagem, nome, preço). O que estragava era uma
 * varredura antiga que retirava a imagem de cada seção e a jogava depois da
 * última seção, produzindo um bloco de imagens soltas no fim do texto.
 *
 * Regra aplicada por imagem:
 *  1. o título "dono" é o que casa com o texto alternativo da imagem;
 *  2. sem casamento exato, aceita prefixo/contenção (nome abreviado pela IA);
 *  3. sem dono identificado, a imagem NÃO é tocada — nunca inventar destino.
 */
function placeImagesInOwnSection(lines: string[]): string[] {
  const out = [...lines]

  const indicesOfTitle = (alvo: string): number => {
    for (let j = 0; j < out.length; j++) {
      if (isTitleLine(out[j].trim()) && titleText(out[j]) === alvo) return j
    }
    return -1
  }

  const titles = out
    .map((l, j) => (isTitleLine(l.trim()) ? { idx: j, text: titleText(l) } : null))
    .filter((t): t is { idx: number; text: string } => t !== null && t.text.length > 2)

  if (!titles.length) return out

  let movidas = 0
  let semDono = 0

  // de trás para frente: remover/inserir não invalida os índices ainda não vistos
  for (let i = out.length - 1; i >= 0; i--) {
    const t = out[i].trim()
    const m = t.match(IMG_LINE_RE)
    if (!m) continue
    const alt = normalize(m[1] || '')
    if (alt.length < 3) continue

    const dono =
      titles.find((x) => x.text === alt) ||
      titles.find((x) => alt.startsWith(x.text)) ||
      titles.find((x) => x.text.length > 4 && alt.includes(x.text)) ||
      titles.find((x) => alt.length > 4 && x.text.includes(alt))

    if (!dono) {
      semDono++
      continue
    }

    const tIdx = indicesOfTitle(dono.text)
    if (tIdx < 0) continue

    // já está logo acima do próprio título (só linhas em branco entre os dois)?
    let k = i + 1
    while (k < out.length && out[k].trim() === '') k++
    if (k === tIdx) continue
    // já está logo abaixo do título, antes de qualquer outro título?
    let acima = i - 1
    while (acima >= 0 && out[acima].trim() === '') acima--
    if (acima >= 0 && isTitleLine(out[acima].trim()) && titleText(out[acima]) === dono.text)
      continue

    // move para logo acima do título da própria seção
    out.splice(i, 1)
    if (i < out.length && out[i].trim() === '') out.splice(i, 1)

    const novoIdx = indicesOfTitle(dono.text)
    if (novoIdx < 0) continue

    if (novoIdx > 0 && out[novoIdx - 1].trim() === '') {
      out.splice(novoIdx, 0, m[0])
    } else {
      out.splice(novoIdx, 0, m[0], '')
    }
    movidas++
  }

  debugLog(
    'placeImagesInOwnSection',
    `movidas=${movidas} semDonoIdentificado=${semDono} linhas=${out.length}`,
  )
  return out
}

export function sanitizeHeadings(content: string): string {
  return content.replace(/^#{1,6}\s*$/gm, '').replace(/\n{3,}/g, '\n\n')
}

export function deduplicateAndLimitImages(content: string): string {
  const lines = content.split('\n')
  const seenUrls = new Set<string>()
  const result: string[] = []
  let inCodeBlock = false
  const keptImages: string[] = []
  const removedDupes: string[] = []
  let totalImages = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      result.push(lines[i])
      continue
    }
    if (inCodeBlock || trimmed.startsWith('|')) {
      result.push(lines[i])
      continue
    }
    if (HEADING_RE.test(trimmed)) {
      result.push(lines[i])
      continue
    }
    const imgMatch = trimmed.match(IMG_LINE_RE)
    if (imgMatch) {
      totalImages++
      const url = imgMatch[2]
      const normalizedUrl = normalizeImageUrl(url)
      if (seenUrls.has(normalizedUrl)) {
        removedDupes.push(url)
        if (result.length > 0 && result[result.length - 1].trim() === '') result.pop()
        if (i + 1 < lines.length && lines[i + 1].trim() === '') i++
        continue
      }
      seenUrls.add(normalizedUrl)
      keptImages.push(url)
    }
    result.push(lines[i])
  }

  debugLog(
    'deduplicateAndLimitImages',
    `totalImages=${totalImages} kept=${keptImages.length} removedDuplicates=${removedDupes.length} beforeLines=${lines.length} afterLines=${result.length}`,
  )

  return result.join('\n')
}

export function enforceLayoutOrder(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let i = 0
  let inCodeBlock = false

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      result.push(lines[i])
      i++
      continue
    }
    if (inCodeBlock || !isTitleLine(trimmed)) {
      result.push(lines[i])
      i++
      continue
    }
    result.push(lines[i])
    i++
    const section: string[] = []
    while (i < lines.length) {
      const s = lines[i].trim()
      if (s.startsWith('```') || isTitleLine(s)) break
      section.push(lines[i])
      i++
    }
    // A imagem do produto fica no COMEÇO da seção dela (antes do nome/preço).
    let imgIdx = -1
    for (let j = 0; j < section.length; j++) {
      if (IMG_LINE_RE.test(section[j].trim())) {
        imgIdx = j
        break
      }
    }
    if (imgIdx > 1) {
      const img = section[imgIdx]
      section.splice(imgIdx, 1)
      if (imgIdx < section.length && section[imgIdx].trim() === '') section.splice(imgIdx, 1)
      const pos = findImageInsertionPoint(section)
      section.splice(pos, 0, img, '')
    }
    result.push(...section)
  }

  const posicionadas = placeImagesInOwnSection(result)
  return posicionadas.join('\n').replace(/\n{3,}/g, '\n\n')
}
