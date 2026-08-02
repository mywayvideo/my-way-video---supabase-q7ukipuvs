import { debugLog } from '@/utils/debug-front'
import { normalizeImageUrl } from '@/lib/image-proxy'

const HEADING_RE = /^#{1,6}\s+/
const IMG_LINE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/

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
    if (inCodeBlock || !HEADING_RE.test(trimmed)) {
      result.push(lines[i])
      i++
      continue
    }
    result.push(lines[i])
    i++
    const section: string[] = []
    while (i < lines.length) {
      const s = lines[i].trim()
      if (s.startsWith('```') || HEADING_RE.test(s)) break
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
      let pos = 0
      while (pos < section.length && section[pos].trim() === '') pos++
      section.splice(pos, 0, img, '')
    }
    result.push(...section)
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n')
}
