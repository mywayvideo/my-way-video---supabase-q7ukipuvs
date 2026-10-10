import { describe, it, expect } from 'vitest'
import {
  analyzeProductsSku,
  SkuDiagnosisResult,
} from '@/services/skuStandardizationService'

describe('skuStandardizationService & analyzeProductsSku', () => {
  const mfrMap = new Map<string, string>([
    ['mfr-sony-id', 'Sony'],
    ['mfr-bmd-id', 'Blackmagic Design'],
    ['mfr-canon-id', 'Canon'],
  ])

  it('correctly categorizes Sony products with and without dashes', () => {
    const mockProducts = [
      {
        id: 'p1',
        name: 'Sony FX3 Cinema Camera',
        sku: 'ILME-FX3',
        manufacturer_id: 'mfr-sony-id',
        price_usd: 3898,
        is_discontinued: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        name: 'Sony FX3 Cinema Camera (Alt)',
        sku: 'ILMEFX3',
        manufacturer_id: 'mfr-sony-id',
        price_usd: 3898,
        is_discontinued: false,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 'p3',
        name: 'Sony Alpha 7R V',
        sku: 'ILCE-7RM5',
        manufacturer_id: 'mfr-sony-id',
        price_usd: 3898,
        is_discontinued: false,
      },
      {
        id: 'p4',
        name: 'Sony Card Reader MRW',
        sku: 'MRWG3',
        manufacturer_id: 'mfr-sony-id',
        price_usd: 120,
        is_discontinued: false,
      },
      {
        id: 'p5',
        name: 'Sony Produto Sem Sku',
        sku: null,
        manufacturer_id: 'mfr-sony-id',
      },
    ]

    const result = analyzeProductsSku(mockProducts, mfrMap)

    expect(result.stats.totalProducts).toBe(5)
    expect(result.stats.sony.total).toBe(5)
    expect(result.stats.sony.withDash).toBe(2) // ILME-FX3, ILCE-7RM5
    expect(result.stats.sony.withoutDash).toBe(2) // ILMEFX3, MRWG3
    expect(result.stats.sony.noSku).toBe(1)
    expect(result.stats.sony.alreadyIdenticalAfterNorm).toBe(2) // ILMEFX3 e MRWG3 já são idênticos à chave
  })

  it('detects collisions between Sony pairs like ILME-FX3 and ILMEFX3', () => {
    const mockProducts = [
      {
        id: 'prod-with-dash',
        name: 'Sony FX3 (com traço)',
        sku: 'ILME-FX3',
        manufacturer_id: 'mfr-sony-id',
        price_usd: 3898,
        is_discontinued: true, // descontinuado
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'prod-without-dash',
        name: 'Sony FX3 (sem traço)',
        sku: 'ILMEFX3',
        manufacturer_id: 'mfr-sony-id',
        price_usd: 3998,
        is_discontinued: false, // ativo
        updated_at: '2026-02-01T00:00:00Z',
      },
    ]

    const result = analyzeProductsSku(mockProducts, mfrMap)

    expect(result.sonyCollisions.length).toBe(1)
    const collision = result.sonyCollisions[0]
    expect(collision.normalizedSku).toBe('ILMEFX3')
    expect(collision.brand).toBe('Sony')
    expect(collision.products.length).toBe(2)

    // O produto ativo e com data mais recente deve ser o sugerido como preferido
    expect(collision.suggestedPreferredId).toBe('prod-without-dash')
  })

  it('distinguishes collisions within other brands and cross-brand collisions', () => {
    const mockProducts = [
      // Colisão dentro da Blackmagic
      {
        id: 'bmd-1',
        name: 'Pocket 4K BMD',
        sku: 'BMD-POCKET4K',
        manufacturer_id: 'mfr-bmd-id',
        price_usd: 1295,
      },
      {
        id: 'bmd-2',
        name: 'Pocket 4K BMD Sem Traço',
        sku: 'BMDPOCKET4K',
        manufacturer_id: 'mfr-bmd-id',
        price_usd: 1295,
      },
      // Colisão cross-brand (Canon vs BMD com mesmo SKU normalizado hipotético)
      {
        id: 'canon-x',
        name: 'Canon Lens X',
        sku: 'LENS-50',
        manufacturer_id: 'mfr-canon-id',
      },
      {
        id: 'bmd-x',
        name: 'BMD Cable 50',
        sku: 'LENS50',
        manufacturer_id: 'mfr-bmd-id',
      },
    ]

    const result = analyzeProductsSku(mockProducts, mfrMap)

    // Colisões Sony
    expect(result.sonyCollisions.length).toBe(0)

    // Colisões mesma marca (não Sony)
    expect(result.otherCollisions.length).toBe(1)
    expect(result.otherCollisions[0].brand).toBe('Blackmagic Design')
    expect(result.otherCollisions[0].normalizedSku).toBe('BMDPOCKET4K')

    // Colisões cross-brand
    expect(result.crossBrandCollisions.length).toBe(1)
    expect(result.crossBrandCollisions[0].normalizedSku).toBe('LENS50')
  })

  it('correctly maps existing collision decisions from the support table', () => {
    const mockProducts = [
      {
        id: 'p1',
        name: 'Sony BRU-SF10',
        sku: 'BRU-SF10',
        manufacturer_id: 'mfr-sony-id',
      },
      {
        id: 'p2',
        name: 'Sony BRUSF10',
        sku: 'BRUSF10',
        manufacturer_id: 'mfr-sony-id',
      },
    ]

    const existingDecisions = [
      {
        id: 'dec-1',
        normalized_sku: 'BRUSF10',
        brand: 'Sony',
        decision_type: 'keep_preferred',
        preferred_product_id: 'p2',
        notes: 'Padrão sem traço conferido na tabela de preços',
        decided_at: '2026-10-09T10:00:00Z',
      },
    ]

    const result = analyzeProductsSku(mockProducts, mfrMap, existingDecisions)

    expect(result.sonyCollisions.length).toBe(1)
    const col = result.sonyCollisions[0]
    expect(col.decision).toBeDefined()
    expect(col.decision?.decision_type).toBe('keep_preferred')
    expect(col.decision?.preferred_product_id).toBe('p2')
    expect(col.decision?.notes).toContain('Padrão sem traço')
  })
})
