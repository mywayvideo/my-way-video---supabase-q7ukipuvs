import { describe, it, expect } from 'vitest'

// Regras universais de identificação de NCM de partes e posições
function isPartsNcmPattern(description: string) {
  if (!description || typeof description !== 'string') {
    return { isParts: false, detectedRanges: [] }
  }

  const text = description.toLowerCase()

  const hasPartsWord = /\b(?:partes?|pe[çc]as?|acess[oó]rios?)\b/i.test(text)
  const hasDestinedWord =
    /\b(?:destinad[ao]s?|utilizad[ao]s?|concebid[ao]s?|pr[oó]pri[ao]s?|exclusiva(?:mente)?|principalmente)\b/i.test(
      text,
    )
  const hasPositionWord =
    /\b(?:posi[çc][oõ]es|posi[çc][aã]o|subposi[çc][oõ]es|subposi[çc][aã]o|n[úu]meros?)\b/i.test(text)

  const isPartsSignature = hasPartsWord && (hasDestinedWord || hasPositionWord)
  if (!isPartsSignature) {
    return { isParts: false, detectedRanges: [] }
  }

  const detectedRanges: { start: number; end: number; rawStart: string; rawEnd: string }[] = []

  const rangeRegex = /(\d{2})\.?(\d{2})\s*(?:a|à|-|at[ée]|to)\s*(\d{2})\.?(\d{2})/gi
  let match: RegExpExecArray | null
  while ((match = rangeRegex.exec(text)) !== null) {
    const startNum = parseInt(`${match[1]}${match[2]}`, 10)
    const endNum = parseInt(`${match[3]}${match[4]}`, 10)
    if (!isNaN(startNum) && !isNaN(endNum) && startNum <= endNum) {
      detectedRanges.push({
        start: startNum,
        end: endNum,
        rawStart: `${match[1]}.${match[2]}`,
        rawEnd: `${match[3]}.${match[4]}`,
      })
    }
  }

  const singlePosRegex =
    /(?:posi[çc][aã]o|subposi[çc][aã]o|n[úu]meros?)\s*(?:n[°ºo]\s*)?(\d{2})\.?(\d{2})/gi
  let singleMatch: RegExpExecArray | null
  while ((singleMatch = singlePosRegex.exec(text)) !== null) {
    const posNum = parseInt(`${singleMatch[1]}${singleMatch[2]}`, 10)
    if (!isNaN(posNum)) {
      const alreadyCovered = detectedRanges.some((r) => posNum >= r.start && posNum <= r.end)
      if (!alreadyCovered) {
        detectedRanges.push({
          start: posNum,
          end: posNum,
          rawStart: `${singleMatch[1]}.${singleMatch[2]}`,
          rawEnd: `${singleMatch[1]}.${singleMatch[2]}`,
        })
      }
    }
  }

  return {
    isParts: true,
    detectedRanges,
  }
}

function isHeadingContainedInPartsRanges(
  heading4Digits: string,
  ranges: { start: number; end: number }[],
): boolean {
  if (!heading4Digits || !ranges || ranges.length === 0) return false
  const headNum = parseInt(heading4Digits.replace(/\D/g, '').slice(0, 4), 10)
  if (isNaN(headNum)) return false

  return ranges.some((range) => headNum >= range.start && headNum <= range.end)
}

describe('Parts NCM Universal Indirect Linking Logic (Frontend/Contract)', () => {
  it('detects parts NCM with heading range 85.24 a 85.28 (e.g. 8529.90.90)', () => {
    const text =
      'Partes reconhecidas como exclusiva ou principalmente destinadas aos aparelhos das posições 85.24 a 85.28 - Outras'
    const result = isPartsNcmPattern(text)

    expect(result.isParts).toBe(true)
    expect(result.detectedRanges.length).toBeGreaterThan(0)
    expect(result.detectedRanges[0]).toEqual({
      start: 8524,
      end: 8528,
      rawStart: '85.24',
      rawEnd: '85.28',
    })
  })

  it('detects parts NCM with range in Chapter 84 (e.g. 84.70 a 84.72)', () => {
    const text =
      'Partes e acessórios reconhecíveis como destinados exclusiva ou principalmente às máquinas das posições 84.70 a 84.72'
    const result = isPartsNcmPattern(text)

    expect(result.isParts).toBe(true)
    expect(result.detectedRanges.length).toBeGreaterThan(0)
    expect(result.detectedRanges[0]).toEqual({
      start: 8470,
      end: 8472,
      rawStart: '84.70',
      rawEnd: '84.72',
    })
  })

  it('detects parts NCM with single heading mention (e.g. posição 85.25)', () => {
    const text = 'Partes concebidas exclusivamente para aparelhos da posição 85.25'
    const result = isPartsNcmPattern(text)

    expect(result.isParts).toBe(true)
    expect(result.detectedRanges.length).toBeGreaterThan(0)
    expect(result.detectedRanges[0]).toEqual({
      start: 8525,
      end: 8525,
      rawStart: '85.25',
      rawEnd: '85.25',
    })
  })

  it('does NOT trigger parts detection on regular equipment descriptions', () => {
    const text =
      'Câmeras de televisão, câmeras fotográficas digitais e câmeras de vídeo - Outras - Com três ou mais captadores de imagem'
    const result = isPartsNcmPattern(text)

    expect(result.isParts).toBe(false)
    expect(result.detectedRanges.length).toBe(0)
  })

  it('checks if target heading 8525 (PTZ camera) falls within 85.24 to 85.28', () => {
    const ranges = [
      {
        start: 8524,
        end: 8528,
        rawStart: '85.24',
        rawEnd: '85.28',
      },
    ]

    expect(isHeadingContainedInPartsRanges('8525', ranges)).toBe(true)
    expect(isHeadingContainedInPartsRanges('8528', ranges)).toBe(true)
    expect(isHeadingContainedInPartsRanges('8524', ranges)).toBe(true)
    // Outside range
    expect(isHeadingContainedInPartsRanges('8518', ranges)).toBe(false)
    expect(isHeadingContainedInPartsRanges('8543', ranges)).toBe(false)
  })
})
