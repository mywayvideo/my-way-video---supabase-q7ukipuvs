import { debugLog } from '@/utils/debug-front'

export function extractModelCode(name: string): string | null {
  const hyphenated = name.match(/\b([A-Z]{1,4}-[A-Z]*\d[A-Z0-9]*)\b/)
  if (hyphenated) return hyphenated[1]

  const nonHyphenated = name.match(/\b([A-Z]{2,4}\d{2,}[A-Z0-9]*)\b/)
  if (nonHyphenated) return nonHyphenated[1]

  return null
}

export function removeOrphanBoldMarkers(text: string): string {
  const placeholders: string[] = []

  let result = text.replace(/\*\*((?:[^*]|\*(?!\*))+?)\*\*/g, (match) => {
    const idx = placeholders.length
    placeholders.push(match)
    return `\uE000B${idx}\uE001`
  })

  const orphanMatches = result.match(/\*\*/g)
  const orphanCount = orphanMatches ? orphanMatches.length : 0

  if (orphanCount > 0) {
    result = result.replace(/\*\*/g, '')
    debugLog(
      'removeOrphanBoldMarkers',
      `orphansRemoved=${orphanCount} inputLen=${text.length} outputLen=${result.length}`,
    )
  }

  result = result.replace(/\uE000B(\d+)\uE001/g, (_, idx) => placeholders[parseInt(idx, 10)])

  return result
}
