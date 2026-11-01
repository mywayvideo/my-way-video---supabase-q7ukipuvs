import { describe, it, expect } from 'vitest'
import {
  normalizeSkuForSuggestion,
  calcLevenshtein,
  calcCodeSimilarity,
  scoreMatchCandidate,
  findTopCandidatesForUnmatchedRow,
  findSimilarTableRowsForCatalogProduct,
} from '@/utils/scansource-matching-helper'

describe('ScanSource Matching Helper - Normalização e Similaridade', () => {
  it('normaliza SKU removendo marca SONY, hífens e sufixos de kit', () => {
    expect(normalizeSkuForSuggestion('SONY PXW-X400KC')).toBe('PXWX400')
    expect(normalizeSkuForSuggestion('PXW-X400KC')).toBe('PXWX400')
    expect(normalizeSkuForSuggestion('ILME-FX30B')).toBe('ILMEFX30')
    expect(normalizeSkuForSuggestion('ILME-FX3/KIT')).toBe('ILMEFX3')
    expect(normalizeSkuForSuggestion('BP-U70')).toBe('BPU70')
    expect(normalizeSkuForSuggestion('MFR # BC-U2A')).toBe('BCU2A')
  })

  it('calcula Levenshtein corretamente', () => {
    expect(calcLevenshtein('PXWX400', 'PXWX400')).toBe(0)
    expect(calcLevenshtein('PXWX400', 'PXWX400K')).toBe(1)
    expect(calcLevenshtein('BPU70', 'BPU35')).toBe(2)
  })

  it('calcula similaridade de código com peso para prefixo e inclusão', () => {
    const simExact = calcCodeSimilarity('PXWX400', 'PXWX400')
    expect(simExact).toBe(1.0)

    const simPrefix = calcCodeSimilarity('PXWX400', 'PXWX400KC')
    expect(simPrefix).toBeGreaterThanOrEqual(0.7)

    const simDifferent = calcCodeSimilarity('BPU70', 'XVSG1')
    expect(simDifferent).toBeLessThan(0.3)
  })

  it('combina similaridade de código e tokens na descrição', () => {
    const candidate = scoreMatchCandidate(
      'PXWX400KC',
      'XDCAM SHOULDER CAMCORDER WITH VIEWFINDER',
      'PXW-X400',
      'Sony PXW-X400 XDCAM Camcorder Body',
    )

    expect(candidate.totalScore).toBeGreaterThanOrEqual(75)
    expect(candidate.codeScore).toBeGreaterThanOrEqual(0.7)
    expect(candidate.tokenScore).toBeGreaterThanOrEqual(0.5)
  })

  it('ranqueia até 5 melhores candidatos para uma linha não casada', () => {
    const mockCatalog = [
      {
        id: 'prod-1',
        name: 'Sony PXW-Z280 4K Camcorder',
        sku: 'PXW-Z280',
        normalizedSku: 'PXWZ280',
        category: 'Cameras',
        price_nationalized_cost: null,
        price_nationalized_currency: null,
      },
      {
        id: 'prod-2',
        name: 'Sony PXW-Z190 4K Camcorder',
        sku: 'PXW-Z190',
        normalizedSku: 'PXWZ190',
        category: 'Cameras',
        price_nationalized_cost: null,
        price_nationalized_currency: null,
      },
      {
        id: 'prod-3',
        name: 'Sony BPU-70 Lithium-Ion Battery',
        sku: 'BP-U70',
        normalizedSku: 'BPU70',
        category: 'Batteries',
        price_nationalized_cost: null,
        price_nationalized_currency: null,
      },
      {
        id: 'prod-4',
        name: 'Sony HXR-NX80 Camcorder',
        sku: 'HXR-NX80',
        normalizedSku: 'HXRNX80',
        category: 'Cameras',
        price_nationalized_cost: null,
        price_nationalized_currency: null,
      },
      {
        id: 'prod-5',
        name: 'Sony Switcher XVS-G1',
        sku: 'XVS-G1',
        normalizedSku: 'XVSG1',
        category: 'Production Switchers',
        price_nationalized_cost: null,
        price_nationalized_currency: null,
      },
      {
        id: 'prod-6',
        name: 'Sony PXW-Z90V 4K Camcorder',
        sku: 'PXW-Z90V',
        normalizedSku: 'PXWZ90V',
        category: 'Cameras',
        price_nationalized_cost: null,
        price_nationalized_currency: null,
      },
    ]

    const candidates = findTopCandidatesForUnmatchedRow(
      'PXWZ280V',
      '4K COMPACT CAMCORDER WITH 3CMOS SENSOR',
      mockCatalog,
      5,
    )

    expect(candidates.length).toBeLessThanOrEqual(5)
    expect(candidates[0].productSku).toBe('PXW-Z280')
    expect(candidates[0].totalScore).toBeGreaterThanOrEqual(70)
  })

  it('faz vinculação reversa encontrando linhas da tabela com SKU similar para produto ausente', () => {
    const mockTable = [
      {
        rowIndex: 12,
        model: 'PXWZ280',
        normalizedModel: 'PXWZ280',
        description: '4K COMPACT CAMCORDER',
        priceUsdSt: 4890.5,
        itemType: 'HW',
      },
      {
        rowIndex: 15,
        model: 'BPU70',
        normalizedModel: 'BPU70',
        description: 'LITHIUM BATTERY',
        priceUsdSt: 280.0,
        itemType: 'HW',
      },
    ]

    const reverse = findSimilarTableRowsForCatalogProduct(
      'PXW-Z280V',
      'Sony PXW-Z280V Handheld Camcorder',
      mockTable,
      3,
    )

    expect(reverse.length).toBeGreaterThan(0)
    expect(reverse[0].tableModel).toBe('PXWZ280')
    expect(reverse[0].priceUsdSt).toBe(4890.5)
  })
})
