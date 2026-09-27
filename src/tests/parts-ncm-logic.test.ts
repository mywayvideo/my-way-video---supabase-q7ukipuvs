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

  describe('Product Nature Tripartite Categorization and Inverse Prohibition Rules', () => {
    // Normalização local espelhando a função da edge function
    function normalizeProductNature(val?: any) {
      const raw = String(val || '').toLowerCase().trim()
      if (
        raw.includes('peça de reposição') ||
        raw.includes('peca de reposicao') ||
        raw.includes('substituição de componente') ||
        raw.includes('reposição') ||
        raw.includes('spare part')
      ) {
        return 'peça de reposição (substituição de componente)'
      }
      if (
        raw.includes('acessório dependente') ||
        raw.includes('acessorio dependente') ||
        raw.includes('sem função autônoma') ||
        raw.includes('requer produto principal') ||
        raw.includes('dependent accessory')
      ) {
        return 'acessório dependente (sem função autônoma, requer produto principal para operar)'
      }
      return 'aparelho com função própria completa'
    }

    function evaluateProductHasStandaloneFunction(params: {
      productUnderstanding?: any
      productText?: string
      isKit?: boolean
    }): boolean {
      const pu = params.productUnderstanding
      if (pu?.product_nature) {
        const nature = normalizeProductNature(pu.product_nature)
        if (nature === 'peça de reposição (substituição de componente)') return false
        if (nature === 'acessório dependente (sem função autônoma, requer produto principal para operar)') return false
        if (nature === 'aparelho com função própria completa') return true
      }
      return true
    }

    it('classifies servo zoom handle as dependent accessory without standalone function', () => {
      const nature = normalizeProductNature(
        'acessório dependente (sem função autônoma, requer produto principal para operar)',
      )
      expect(nature).toBe(
        'acessório dependente (sem função autônoma, requer produto principal para operar)',
      )

      const hasStandalone = evaluateProductHasStandaloneFunction({
        productUnderstanding: {
          product_nature: nature,
          identity: 'manopla de controle de servo zoom para teleobjetiva',
        },
      })
      // Não deve ter função standalone, portanto o NCM de partes NÃO é bloqueado pela proibição inversa
      expect(hasStandalone).toBe(false)
    })

    it('classifies replacement part as spare part without standalone function (inverse prohibition applies)', () => {
      const nature = normalizeProductNature('peça de reposição (substituição de componente)')
      expect(nature).toBe('peça de reposição (substituição de componente)')

      const hasStandalone = evaluateProductHasStandaloneFunction({
        productUnderstanding: {
          product_nature: nature,
          identity: 'engrenagem avulsa de reposição',
        },
      })
      expect(hasStandalone).toBe(false)
    })

    it('classifies standalone device as complete apparatus (inverse prohibition applies to prevent parts from winning)', () => {
      const nature = normalizeProductNature('aparelho com função própria completa')
      expect(nature).toBe('aparelho com função própria completa')

      const hasStandalone = evaluateProductHasStandaloneFunction({
        productUnderstanding: {
          product_nature: nature,
          identity: 'câmera de estúdio profissional',
        },
      })
      expect(hasStandalone).toBe(true)
    })

    it('does NOT let commercial term "controlador" or "controle" turn a dependent accessory into standalone device', () => {
      const pu = {
        product_nature: 'acessório dependente (sem função autônoma, requer produto principal para operar)',
        identity: 'controlador / manopla de foco para lente teleobjetiva',
      }
      const hasStandalone = evaluateProductHasStandaloneFunction({
        productUnderstanding: pu,
        productText: 'controlador remoto de servo foco e zoom para objetivas broadcast',
      })
      expect(hasStandalone).toBe(false)
    })
  })

  describe('Precedência Genérica de Partes sobre Residual de Função Própria (RGI 1, Nota 2(b) do Cap. 85)', () => {
    // Implementações de teste espelhando as funções da edge function
    function isResidualStandaloneDeviceNcm(description: string): boolean {
      if (!description || typeof description !== 'string') return false
      const text = description.toLowerCase()
      return (
        /\bn[aã]o\s+especificad[ao]s?\s+nem\s+compreendid[ao]s?\b/i.test(text) ||
        /\bn[aã]o\s+especificad[ao]s?\s+noutras?\s+posi[çc][oõ]es\b/i.test(text) ||
        /\bn[aã]o\s+especificad[ao]s?\s+em\s+outras?\s+posi[çc][oõ]es\b/i.test(text)
      )
    }

    function evaluatePartsPrecedenceOverResidual(params: {
      productNature: string
      currentRecNcm: string
      currentRecDesc: string
      candidates: any[]
      targetHeadings: string[]
    }) {
      const isDependentAccessory =
        params.productNature ===
        'acessório dependente (sem função autônoma, requer produto principal para operar)'

      if (!isDependentAccessory) {
        return {
          shouldOverride: false,
          winningCandidate: null,
          demotedCandidate: null,
          verdict: {
            applied: false,
            winning_parts_ncm: null,
            demoted_residual_ncm: null,
            reason: 'Precedência de partes não se aplica: produto não é acessório dependente.',
          },
        }
      }

      const isCurrentResidual = isResidualStandaloneDeviceNcm(params.currentRecDesc)
      if (!isCurrentResidual) {
        return {
          shouldOverride: false,
          winningCandidate: null,
          demotedCandidate: null,
          verdict: {
            applied: false,
            winning_parts_ncm: null,
            demoted_residual_ncm: null,
            reason: 'Recomendação atual não é NCM residual de função própria.',
          },
        }
      }

      for (const cand of params.candidates || []) {
        const candDesc = cand.ncm_descricao_full || cand.ncm_descricao || ''
        const partsPattern = isPartsNcmPattern(candDesc)
        if (!partsPattern.isParts || partsPattern.detectedRanges.length === 0) continue

        for (const heading of params.targetHeadings) {
          if (isHeadingContainedInPartsRanges(heading, partsPattern.detectedRanges)) {
            const matchedRangeText = partsPattern.detectedRanges
              .map((r) => `${r.rawStart} a ${r.rawEnd}`)
              .join(', ')

            return {
              shouldOverride: true,
              winningCandidate: cand,
              demotedCandidate: {
                ncm: params.currentRecNcm,
                description: params.currentRecDesc,
              },
              matchedRangeStr: matchedRangeText,
              matchedHeading: heading,
              verdict: {
                applied: true,
                winning_parts_ncm: cand.ncm,
                winning_parts_desc: candDesc,
                demoted_residual_ncm: params.currentRecNcm,
                demoted_residual_desc: params.currentRecDesc,
                target_machine_position: heading,
                matched_range: matchedRangeText,
                reason: `Precedência determinística aplicada (RGI 1, Nota 2(b) do Cap. 85): Para acessório dependente destinado a aparelhos da posição ${heading}, o NCM de partes ${cand.ncm} prevalece sobre o residual ${params.currentRecNcm}.`,
              },
            }
          }
        }
      }

      return {
        shouldOverride: false,
        winningCandidate: null,
        demotedCandidate: null,
        verdict: {
          applied: false,
          winning_parts_ncm: null,
          demoted_residual_ncm: null,
          reason: 'Nenhum NCM de partes casando com os target_machines.',
        },
      }
    }

    it('identifies residual device NCM signature in 85437099 ("não especificados nem compreendidos")', () => {
      const desc =
        'Máquinas e aparelhos elétricos com função própria, não especificados nem compreendidos noutras posições do presente Capítulo | Outras máquinas e aparelhos | Outros'
      expect(isResidualStandaloneDeviceNcm(desc)).toBe(true)
    })

    it('does NOT classify non-residual camera or microphone NCM as residual device', () => {
      const cameraDesc =
        'Câmeras de televisão, câmeras fotográficas digitais e câmeras de vídeo | Câmeras de televisão | Com três ou mais captadores de imagem'
      expect(isResidualStandaloneDeviceNcm(cameraDesc)).toBe(false)

      const micDesc =
        'Microfones e seus suportes; alto-falantes; fones de ouvido; amplificadores elétricos de áudio | Microfones e seus suportes'
      expect(isResidualStandaloneDeviceNcm(micDesc)).toBe(false)
    })

    it('applies parts precedence for dependent accessory when parts NCM matches target machines (RM-IP500 case)', () => {
      const candidates = [
        {
          ncm: '85437099',
          ncm_descricao_full:
            'Máquinas e aparelhos elétricos com função própria, não especificados nem compreendidos noutras posições do presente Capítulo | Outras | Outros',
        },
        {
          ncm: '85299090',
          ncm_descricao_full:
            'Partes reconhecíveis como destinada, exclusiva ou principalmente, aos aparelhos das posições 85.24 a 85.28 | Outras | Outras',
        },
      ]

      const evalResult = evaluatePartsPrecedenceOverResidual({
        productNature: 'acessório dependente (sem função autônoma, requer produto principal para operar)',
        currentRecNcm: '85437099',
        currentRecDesc: candidates[0].ncm_descricao_full,
        candidates,
        targetHeadings: ['8525'], // Câmeras PTZ
      })

      expect(evalResult.shouldOverride).toBe(true)
      expect(evalResult.winningCandidate?.ncm).toBe('85299090')
      expect(evalResult.demotedCandidate?.ncm).toBe('85437099')
      expect(evalResult.verdict.applied).toBe(true)
      expect(evalResult.verdict.winning_parts_ncm).toBe('85299090')
      expect(evalResult.verdict.demoted_residual_ncm).toBe('85437099')
    })

    it('does NOT apply parts precedence for complete apparatus with standalone function (HDC-3200R case)', () => {
      const candidates = [
        {
          ncm: '85258921',
          ncm_descricao_full:
            'Câmeras de televisão | Com três ou mais captadores de imagem',
        },
        {
          ncm: '85299090',
          ncm_descricao_full:
            'Partes reconhecíveis como destinada, exclusiva ou principalmente, aos aparelhos das posições 85.24 a 85.28',
        },
      ]

      const evalResult = evaluatePartsPrecedenceOverResidual({
        productNature: 'aparelho com função própria completa',
        currentRecNcm: '85258921',
        currentRecDesc: candidates[0].ncm_descricao_full,
        candidates,
        targetHeadings: ['8525'],
      })

      expect(evalResult.shouldOverride).toBe(false)
      expect(evalResult.verdict.applied).toBe(false)
      expect(evalResult.winningCandidate).toBeNull()
    })
  })
})
