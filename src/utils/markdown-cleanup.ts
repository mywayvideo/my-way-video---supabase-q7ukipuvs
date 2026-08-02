import { debugLog, debugWarn } from '@/utils/debug-front'

export function extractModelCode(name: string): string | null {
  const hyphenated = name.match(/\b([A-Z]{1,4}-[A-Z]*\d[A-Z0-9]*)\b/)
  if (hyphenated) return hyphenated[1]

  const nonHyphenated = name.match(/\b([A-Z]{2,4}\d{2,}[A-Z0-9]*)\b/)
  if (nonHyphenated) return nonHyphenated[1]

  return null
}

export function removeOrphanBoldMarkers(text: string): string {
  const placeholders: string[] = []

  const protectedText = text.replace(/\*\*((?:[^*]|\*(?!\*))+?)\*\*/g, (match) => {
    const idx = placeholders.length
    placeholders.push(match)
    return `\uE000B${idx}\uE001`
  })

  const orphanMatches = protectedText.match(/\*\*/g)
  const orphanCount = orphanMatches ? orphanMatches.length : 0

  const inputLen = protectedText.length
  let result = protectedText

  if (orphanCount > 0) {
    const lines = result.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^\s*\*\*\s*$/.test(line)) {
        lines[i] = line.replace(/\*\*/g, '')
        continue
      }
      lines[i] = lines[i].replace(/^(\s*)\*\*/, '$1')
      lines[i] = lines[i].replace(/\*\*(\s*)$/, '$1')
    }
    result = lines.join('\n')
  }

  const outputLen = result.length
  const charsRemoved = inputLen - outputLen

  if (charsRemoved > orphanCount * 2 + 10) {
    debugWarn(
      'removeOrphanBoldMarkers:safetyAbort',
      `charsRemoved=${charsRemoved} orphanCount=${orphanCount} threshold=${orphanCount * 2 + 10} reason="more characters removed than expected, returning original"`,
    )
    return text
  }

  if (orphanCount > 0) {
    debugLog(
      'removeOrphanBoldMarkers',
      `orphansRemoved=${orphanCount} charsRemoved=${charsRemoved} inputLen=${inputLen} outputLen=${outputLen}`,
    )
  }

  result = result.replace(/\uE000B(\d+)\uE001/g, (_, idx) => placeholders[parseInt(idx, 10)])

  return result
}
