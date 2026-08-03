import { debugLog } from '@/utils/debug-front'
import { normalizeImageUrl } from '@/lib/image-proxy'

const HEADING_RE = /^#{1,6}\s+/
const IMG_LINE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/
const BOLD_TITLE_RE = /^\*\*[^*]+\*\*$/

function isTitleLine(trimmed: string): boolean {
  return HEADING_RE.test(trimmed) || BOLD_TITLE_RE.test(trimmed)
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

function finalAntiErrorSweep(lines: string[]): string[] {
  let result = [...lines]
  let changed = true
  while (changed) {
    changed = false
    let inCodeBlock = false
    for (let i = 0; i < result.length; i++) {
      const trimmed = result[i].trim()
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (inCodeBlock) continue
      if (!IMG_LINE_RE.test(trimmed)) continue
      let nextIdx = i + 1
      while (nextIdx < result.length && result[nextIdx].trim() === '') nextIdx++
      if (nextIdx >= result.length || !isTitleLine(result[nextIdx].trim())) continue
      const img = result[i]
      result.splice(i, 1)
      if (i < result.length && result[i].trim() === '') result.splice(i, 1)
      let titleIdx = i
      while (titleIdx < result.length && result[titleIdx].trim() === '') titleIdx++
      if (titleIdx >= result.length || !isTitleLine(result[titleIdx].trim())) {
        result.splice(i, 0, img)
        continue
      }
      let insertPos = titleIdx + 1
      while (insertPos < result.length && result[insertPos].trim() === '') insertPos++
      while (insertPos < result.length) {
        const t = result[insertPos].trim()
        if (t === '' || isTitleLine(t) || IMG_LINE_RE.test(t)) break
        insertPos++
      }
      result.splice(insertPos, 0, '', img)
      changed = true
      break
    }
  }
  return result
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
  debugLog(
    'deduplicateAndLimitImages:kept',
    `urls=[${keptImages.map((u) => u.substring(0, 80)).join(', ')}]`,
  )
  debugLog(
    'deduplicateAndLimitImages:removedDuplicates',
    `urls=[${removedDupes.map((u) => u.substring(0, 80)).join(', ')}]`,
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

  const swept = finalAntiErrorSweep(result)
  return swept.join('\n').replace(/\n{3,}/g, '\n\n')
}
