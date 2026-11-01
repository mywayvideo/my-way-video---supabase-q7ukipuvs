import { describe, it, expect } from 'vitest'
import {
  colLettersToIndex,
  parseCellRef,
} from '@/utils/xlsx-native-parser'
import {
  parseExcelPrice,
  roundToTwoDecimals,
  cleanNcm,
  extractEffectiveDate,
  ScanSourceParsedRow,
} from '@/utils/scansource-parser'
import { normalizeSkuKey } from '@/utils/sku-normalization'
import {
  scanSourceImportService,
  CatalogProductSummary,
} from '@/services/scanSourceImportService'

describe('ScanSource XLSX Native Parser & Helpers', () => {
  it('converte letras de coluna Excel para índice zero-based', () => {
    expect(colLettersToIndex('A')).toBe(0)
    expect(colLettersToIndex('B')).toBe(1)
    expect(colLettersToIndex('C')).toBe(2)
    expect(colLettersToIndex('D')).toBe(3)
    expect(colLettersToIndex('I')).toBe(8)
    expect(colLettersToIndex('R')).toBe(17)
    expect(colLettersToIndex('AA')).toBe(26)
  })

  it('faz parse de referência de célula (parseCellRef)', () => {
    expect(parseCellRef('A1')).toEqual({ col: 0, row: 1 })
    expect(parseCellRef('D4')).toEqual({ col: 3, row: 4 })
    expect(parseCellRef('R12')).toEqual({ col: 17, row: 12 })
  })

  it('arredonda preços com múltiplas casas decimais para 2 casas exatas', () => {
    expect(roundToTwoDecimals(13233.029893970659)).toBe(13233.03)
    expect(roundToTwoDecimals(22934.471234)).toBe(22934.47)
    expect(roundToTwoDecimals(36729.440862551106)).toBe(36729.44)
    expect(roundToTwoDecimals(0.04)).toBe(0.04)
  })

  it('faz parse de preços numéricos e textuais da planilha (parseExcelPrice)', () => {
    expect(parseExcelPrice(22934.47)).toBe(22934.47)
    expect(parseExcelPrice('22934.47')).toBe(22934.47)
    expect(parseExcelPrice('22.934,47')).toBe(22934.47)
    expect(parseExcelPrice('US$ 22,934.47')).toBe(22934.47)
    expect(parseExcelPrice('')).toBeNull()
    expect(parseExcelPrice(null)).toBeNull()
  })

  it('formata NCM com pontuação padrão de 8 dígitos', () => {
    expect(cleanNcm('85437099')).toBe('8543.70.99')
    expect(cleanNcm(85437099)).toBe('8543.70.99')
    expect(cleanNcm('85234920')).toBe('8523.49.20')
    expect(cleanNcm('')).toBe('')
  })

  it('extrai vigência "JAN 2nd 2025" do cabeçalho', () => {
    const mockRows = [
      ['DEALERLISTPRICE', 'DEALER LIST PRICE (JAN 2nd 2025)'],
      ['', ''],
      ['MODEL', 'Descrição', '', 'Preços em US$ com ST'],
    ]
    expect(extractEffectiveDate(mockRows)).toBe('JAN 2nd 2025')
  })
})

describe('Regras de Negócio e Casamento Alfanumérico', () => {
  it('normaliza códigos alfanuméricos com normalizeSkuKey para cruzar PXWX400KC com PXW-X400KC', () => {
    const tableModel = 'PXWX400KC'
    const catalogSku = 'PXW-X400KC'

    expect(normalizeSkuKey(tableModel)).toBe('PXWX400KC')
    expect(normalizeSkuKey(catalogSku)).toBe('PXWX400KC')
    expect(normalizeSkuKey(tableModel)).toBe(normalizeSkuKey(catalogSku))
  })

  it('normaliza BPU70 com BP-U70 e BCU2A com BC-U2A', () => {
    expect(normalizeSkuKey('BPU70')).toBe(normalizeSkuKey('BP-U70'))
    expect(normalizeSkuKey('BCU2A')).toBe(normalizeSkuKey('BC-U2A'))
    expect(normalizeSkuKey('XVSG1')).toBe(normalizeSkuKey('XVS-G1'))
  })

  it('distingue produtos com alteração de custo vs inalterados e preserva price_usd', async () => {
    const mockCatalog: CatalogProductSummary[] = [
      {
        id: 'prod-1',
        name: 'Sony PXW-X400KC Camcorder',
        sku: 'PXW-X400KC',
        normalizedSku: 'PXWX400KC',
        price_nationalized_cost: 20000.0,
        price_nationalized_currency: 'Nacionalizado USD',
        price_usd: 25000.0,
        price_brl: 150000.0,
        category: 'Cameras',
        category_id: 'cat-1',
        manufacturer_id: 'sony-1',
        is_discontinued: false,
      },
      {
        id: 'prod-2',
        name: 'Sony Switcher XVS-G1',
        sku: 'XVS-G1',
        normalizedSku: 'XVSG1',
        price_nationalized_cost: 35598.2, // mesmo custo
        price_nationalized_currency: 'Nacionalizado USD',
        price_usd: 40000.0,
        price_brl: 240000.0,
        category: 'Production Switchers',
        category_id: 'cat-2',
        manufacturer_id: 'sony-1',
        is_discontinued: false,
      },
    ]

    const mockRows: ScanSourceParsedRow[] = [
      {
        rowIndex: 5,
        model: 'PXWX400KC',
        normalizedModel: 'PXWX400KC',
        description: 'XDCAM CAMCORDER',
        priceUsdSt: 22934.47,
        rawPriceUsdSt: 22934.47,
        ncmSuggested: '8525.89.21',
        itemType: 'HW',
        is3rdParty: false,
        isSoftware: false,
        isAnomaly: false,
      },
      {
        rowIndex: 6,
        model: 'XVSG1',
        normalizedModel: 'XVSG1',
        description: 'MULTI FORMAT PROCESSOR',
        priceUsdSt: 35598.2,
        rawPriceUsdSt: 35598.2,
        ncmSuggested: '8543.70.99',
        itemType: 'HW',
        is3rdParty: false,
        isSoftware: false,
        isAnomaly: false,
      },
      {
        rowIndex: 7,
        model: 'XZS9600',
        normalizedModel: 'XZS9600',
        description: 'HDR CONVERTER SOFTWARE',
        priceUsdSt: 36729.44,
        rawPriceUsdSt: 36729.44,
        ncmSuggested: '8523.49.20',
        itemType: 'SW',
        is3rdParty: false,
        isSoftware: true,
        isAnomaly: false,
      },
    ]

    const preview = await scanSourceImportService.buildCrossMatchPreview(
      {
        sheetName: 'DEALERListPrice',
        effectiveDate: 'JAN 2nd 2025',
        totalRowsFound: 3,
        dataRows: mockRows,
        validRows: mockRows,
        ignored3rdCount: 0,
        softwareCount: 1,
        hardwareCount: 2,
        anomalyRows: [],
      },
      'test.xlsx',
      mockCatalog,
      [
        { id: 'cat-1', name: 'Cameras' },
        { id: 'cat-2', name: 'Production Switchers' },
      ],
    )

    // PXWX400KC deve casar com PXW-X400KC e ter mudança de valor
    expect(preview.matchedCount).toBe(2)
    expect(preview.matchedWithChangeCount).toBe(1)
    expect(preview.matchedUnchangedCount).toBe(1)

    const pxwMatch = preview.matchedWithChange.find(
      (m) => m.product.sku === 'PXW-X400KC',
    )
    expect(pxwMatch).toBeDefined()
    expect(pxwMatch?.newCostUsd).toBe(22934.47)
    expect(pxwMatch?.currentCostUsd).toBe(20000.0)

    // O item XZS9600 não existe no catálogo -> deve ir para unmatched (revisão)
    expect(preview.unmatchedCount).toBe(1)
    expect(preview.unmatchedItems[0].row.model).toBe('XZS9600')

    // Confere que amostra de destaque pxwSample foi preenchida
    expect(preview.pxwSample).toBeDefined()
    expect(preview.pxwSample?.newCostUsd).toBe(22934.47)
  })

  it('gera relatório de produtos ausentes no catálogo e exporta CSV', () => {
    const missing = [
      {
        id: 'prod-missing-1',
        name: 'Sony HXR-NX80',
        sku: 'HXR-NX80',
        category: 'Cameras',
        price_nationalized_cost: 1800.0,
        price_nationalized_currency: 'Nacionalizado USD',
        price_usd: 2200.0,
      },
    ]

    const csv = scanSourceImportService.exportMissingCatalogCsv(missing)
    expect(csv).toContain('SKU,Nome do Produto,Categoria')
    expect(csv).toContain('"HXR-NX80"')
    expect(csv).toContain('1800.00')
  })
})
