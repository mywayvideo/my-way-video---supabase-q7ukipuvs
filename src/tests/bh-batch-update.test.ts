import { describe, it, expect, vi } from 'vitest'
import {
  bhBatchUpdateService,
  ProductBatchItem,
} from '@/services/bhBatchUpdateService'
import { priceCheckService } from '@/services/priceCheckService'

describe('B&H Batch Update Service & Business Rules', () => {
  it('estimates Firecrawl credits: 1 credit with link, 3 credits without link (search 2 + scrape 1)', () => {
    const items = [
      { website_url: 'https://www.bhphotovideo.com/c/product/1-sony-fx3.html' },
      { website_url: 'https://www.bhphotovideo.com/c/product/2-lens.html' },
      { website_url: null },
      { website_url: '' },
      { website_url: '   ' },
    ]

    const estimate = bhBatchUpdateService.estimateFirecrawlCredits(items)

    expect(estimate.withLinkCount).toBe(2)
    expect(estimate.withoutLinkCount).toBe(3)
    // 2 * 1 (scrape comum) + 3 * 3 (busca 2 + scrape 1) = 2 + 9 = 11 créditos
    expect(estimate.creditsDirectScrape).toBe(2)
    expect(estimate.creditsSearchFlow).toBe(9)
    expect(estimate.totalCredits).toBe(11)
  })

  it('resolves paired evaluation in batch items matching product edit page logic (Sony AN820A)', () => {
    // Sony AN820A com campos NATIVOS: price_usd 282, price_usa_rebate 159, date_rebate no futuro
    // B&H retorna: price_bh 159, price_full 282, price_with_rebate 159, rebate_active true.
    const sonyAn820NativeItem: ProductBatchItem = {
      id: 'prod-sony-an820a',
      name: 'Sony AN-820A Active Dipole Antenna',
      sku: 'AN820A',
      price_usd: 282,
      price_usa_rebate: 159,
      date_rebate: new Date(Date.now() + 86400000 * 30).toISOString(),
      website_url: 'https://www.bhphotovideo.com/c/product/68297-REG/Sony_AN820A_AN_820A_Active_Antenna.html',
      is_discontinued: false,
      updated_at: '2026-10-01',
      last_reviewed_at: '2026-10-01',
      batchStatus: 'done',
      checkResult: {
        status: 'divergente', // Edge function bruta antes da avaliação pareada
        price_usd_cadastrado: 282,
        price_bh: 159,
        diff_usd: -123,
        diff_pct: -43.62,
        rebate_active: true,
        price_full: 282,
        price_with_rebate: 159,
        rebate_savings: 123,
        rebate_end_date: 'Ends May 31',
      },
    }

    // Avalia pareado diretamente dos campos nativos do item, sem depender de activeRebatesMap
    const resNative = bhBatchUpdateService.resolveItemPairedEvaluation(sonyAn820NativeItem)
    expect(resNative.effectiveStatus).toBe('ok')
    expect(resNative.pairedEval?.overallWithinTolerance).toBe(true)
    expect(resNative.pairedEval?.fullPair?.isWithinTolerance).toBe(true)
    expect(resNative.pairedEval?.rebatePair?.isWithinTolerance).toBe(true)
    expect(resNative.pairedEval?.fullPair?.diffUsd).toBe(0)
    expect(resNative.pairedEval?.rebatePair?.diffUsd).toBe(0)

    // Validar se calculateStats computa como OK diretamente dos campos nativos
    const statsNative = bhBatchUpdateService.calculateStats([sonyAn820NativeItem])
    expect(statsNative.okCount).toBe(1)
    expect(statsNative.divergenceCount).toBe(0)
    expect(statsNative.rebateDetectedCount).toBe(1)
  })

  it('calculates batch statistics accurately', () => {
    const items: ProductBatchItem[] = [
      {
        id: 'p1',
        name: 'Item 1',
        sku: 'SKU1',
        price_usd: 100,
        website_url: 'http://bh.com/1',
        is_discontinued: false,
        updated_at: '2026-10-01',
        last_reviewed_at: '2026-10-01',
        batchStatus: 'done',
        checkResult: {
          status: 'ok',
          price_usd_cadastrado: 100,
          price_bh: 100,
          diff_usd: 0,
          diff_pct: 0,
        },
      },
      {
        id: 'p2',
        name: 'Item 2',
        sku: 'SKU2',
        price_usd: 500,
        website_url: null,
        is_discontinued: false,
        updated_at: '2026-10-01',
        last_reviewed_at: '2026-10-01',
        batchStatus: 'done',
        checkResult: {
          status: 'divergente',
          price_usd_cadastrado: 500,
          price_bh: 550,
          diff_usd: 50,
          diff_pct: 10,
          url_discovered: true,
          url_used: 'http://bh.com/discovered-2',
        },
      },
      {
        id: 'p3',
        name: 'Item 3',
        sku: 'SKU3',
        price_usd: 300,
        website_url: 'http://bh.com/3',
        is_discontinued: true,
        updated_at: '2026-10-01',
        last_reviewed_at: '2026-10-01',
        batchStatus: 'done',
        checkResult: {
          status: 'descontinuado',
          price_usd_cadastrado: 300,
          price_bh: null,
          is_discontinued: true,
        },
      },
      {
        id: 'p4',
        name: 'Item 4',
        sku: 'SKU4',
        price_usd: 250,
        website_url: null,
        is_discontinued: false,
        updated_at: '2026-10-01',
        last_reviewed_at: '2026-10-01',
        batchStatus: 'done',
        checkResult: {
          status: 'sem_url_confirmada',
          message: 'SKU não pôde ser confirmado com precisão',
        },
      },
      {
        id: 'p5',
        name: 'Item 5',
        sku: 'SKU5',
        price_usd: 1200,
        website_url: 'http://bh.com/5',
        is_discontinued: false,
        updated_at: '2026-10-01',
        last_reviewed_at: '2026-10-01',
        batchStatus: 'done',
        checkResult: {
          status: 'divergente',
          price_usd_cadastrado: 1200,
          price_bh: 999,
          diff_usd: -201,
          diff_pct: -16.75,
          rebate_active: true,
          price_full: 1200,
          price_with_rebate: 999,
          rebate_end_date: 'Ends May 31',
        },
      },
      {
        id: 'p6',
        name: 'Item 6',
        sku: 'SKU6',
        price_usd: 80,
        website_url: 'http://bh.com/6',
        is_discontinued: false,
        updated_at: '2026-10-01',
        last_reviewed_at: '2026-10-01',
        batchStatus: 'error',
        errorMessage: 'Network timeout',
      },
      {
        id: 'p7',
        name: 'Item 7 (Pendente)',
        sku: 'SKU7',
        price_usd: 400,
        website_url: 'http://bh.com/7',
        is_discontinued: false,
        updated_at: '2026-10-01',
        last_reviewed_at: '2026-10-01',
        batchStatus: 'idle',
      },
    ]

    const stats = bhBatchUpdateService.calculateStats(items)

    expect(stats.totalSelected).toBe(7)
    expect(stats.processedCount).toBe(6) // 5 done + 1 error
    expect(stats.okCount).toBe(1)
    expect(stats.divergenceCount).toBe(2)
    expect(stats.discontinuedCount).toBe(1)
    expect(stats.doubtfulLinkCount).toBe(1)
    expect(stats.urlDiscoveredCount).toBe(1)
    expect(stats.rebateDetectedCount).toBe(1)
    expect(stats.errorCount).toBe(1)
  })

  it('correctly maps status labels and badges', () => {
    expect(bhBatchUpdateService.getStatusLabel('ok', 'done').label).toBe('Preço OK')
    expect(bhBatchUpdateService.getStatusLabel('divergente', 'done').label).toBe('Divergente')
    expect(bhBatchUpdateService.getStatusLabel('descontinuado', 'done').label).toBe('Descontinuado')
    expect(bhBatchUpdateService.getStatusLabel('sem_url_confirmada', 'done').label).toBe('Link Duvidoso / Ausente')
    expect(bhBatchUpdateService.getStatusLabel('erro', 'done').label).toBe('Falha / Erro')
    expect(bhBatchUpdateService.getStatusLabel(undefined, 'processing').label).toBe('Verificando...')
    expect(bhBatchUpdateService.getStatusLabel(undefined, 'idle').label).toBe('Pendente')
  })

  it('parses rebate information from edge function payload without applying automatically', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: {
        status: 'divergente',
        price_usd_cadastrado: 1500,
        price_bh: 1299,
        diff_usd: -201,
        diff_pct: -13.4,
        url_used: 'https://www.bhphotovideo.com/c/product/123-camera.html',
        url_discovered: false,
        message: 'Preço divergente da B&H. [Rebate/Instant Savings ativo na B&H]',
        rebate_active: true,
        price_full: 1500,
        price_with_rebate: 1299,
        rebate_savings: 201,
        rebate_end_date: 'Offer ends Oct 11 at 11:59 PM ET',
        rebate_end_date_iso: '2025-10-11T23:59:00.000Z',
      },
      error: null,
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalInvoke = supabase.functions.invoke
    supabase.functions.invoke = mockInvoke as any

    try {
      const result = await priceCheckService.checkBhPrice('prod-rebate-test', 'batch')

      expect(mockInvoke).toHaveBeenCalledWith('check-price-bhphoto', {
        body: {
          product_id: 'prod-rebate-test',
          source: 'batch',
        },
      })
      expect(result.rebate_active).toBe(true)
      expect(result.price_full).toBe(1500)
      expect(result.price_with_rebate).toBe(1299)
      expect(result.rebate_savings).toBe(201)
      expect(result.rebate_end_date).toBe('Offer ends Oct 11 at 11:59 PM ET')
      expect(result.rebate_end_date_iso).toBe('2025-10-11T23:59:00.000Z')
    } finally {
      supabase.functions.invoke = originalInvoke
    }
  })

  it('applying B&H price updates price_usd and synchronizes updated_at = last_reviewed_at', async () => {
    let updatedPayload: any = null
    const mockUpdate = vi.fn((payload) => {
      updatedPayload = payload
      return {
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalFrom = supabase.from
    supabase.from = vi.fn((table: any) => {
      if (table === 'products') {
        return {
          update: mockUpdate,
        } as any
      }
      return originalFrom(table)
    }) as any

    try {
      await priceCheckService.applyBhPrice('prod-1', 899.5)

      expect(mockUpdate).toHaveBeenCalled()
      expect(updatedPayload.price_usd).toBe(899.5)
      expect(updatedPayload.updated_at).toBeDefined()
      expect(updatedPayload.last_reviewed_at).toBeDefined()
      expect(updatedPayload.updated_at).toBe(updatedPayload.last_reviewed_at)
    } finally {
      supabase.from = originalFrom
    }
  })

  it('updating manual website_url synchronizes updated_at = last_reviewed_at', async () => {
    let updatedPayload: any = null
    const mockUpdate = vi.fn((payload) => {
      updatedPayload = payload
      return {
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalFrom = supabase.from
    supabase.from = vi.fn((table: any) => {
      if (table === 'products') {
        return {
          update: mockUpdate,
        } as any
      }
      return originalFrom(table)
    }) as any

    try {
      await priceCheckService.updateWebsiteUrl('prod-1', 'https://www.bhphotovideo.com/c/product/999.html')

      expect(mockUpdate).toHaveBeenCalled()
      expect(updatedPayload.website_url).toBe('https://www.bhphotovideo.com/c/product/999.html')
      expect(updatedPayload.updated_at).toBeDefined()
      expect(updatedPayload.last_reviewed_at).toBeDefined()
      expect(updatedPayload.updated_at).toBe(updatedPayload.last_reviewed_at)
    } finally {
      supabase.from = originalFrom
    }
  })

  it('manual review confirmation updates ONLY last_reviewed_at, never updated_at (single and batch)', async () => {
    let singlePayload: any = null
    let batchPayload: any = null

    const mockUpdate = vi.fn((payload) => {
      return {
        eq: vi.fn((col, val) => {
          singlePayload = payload
          return Promise.resolve({ error: null })
        }),
        in: vi.fn((col, vals) => {
          batchPayload = payload
          return Promise.resolve({ error: null })
        }),
      }
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalFrom = supabase.from
    supabase.from = vi.fn((table: any) => {
      if (table === 'products') {
        return {
          update: mockUpdate,
        } as any
      }
      return originalFrom(table)
    }) as any

    try {
      // 1. Single review confirmation
      const singleRes = await bhBatchUpdateService.confirmSingleReview('prod-123')
      expect(singleRes).toBeDefined()
      expect(singlePayload).toBeDefined()
      expect(singlePayload.last_reviewed_at).toBeDefined()
      expect(singlePayload.updated_at).toBeUndefined()

      // 2. Batch review confirmation
      const batchRes = await bhBatchUpdateService.confirmBatchReview(['prod-1', 'prod-2', 'prod-3'])
      expect(batchRes).toBeDefined()
      expect(batchPayload).toBeDefined()
      expect(batchPayload.last_reviewed_at).toBeDefined()
      expect(batchPayload.updated_at).toBeUndefined()
    } finally {
      supabase.from = originalFrom
    }
  })

  it('analyzing manual url sends manual_url to check-price-bhphoto and handles response', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: {
        status: 'ok',
        price_usd_cadastrado: 299,
        price_bh: 299,
        diff_usd: 0,
        diff_pct: 0,
        url_used: 'https://www.bhphotovideo.com/c/product/456-mic.html',
        url_discovered: true,
        sku_matched: true,
        rebate_active: false,
      },
      error: null,
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalInvoke = supabase.functions.invoke
    supabase.functions.invoke = mockInvoke as any

    try {
      const result = await bhBatchUpdateService.analyzeManualUrl(
        'prod-mic',
        'https://www.bhphotovideo.com/c/product/456-mic.html',
      )

      expect(mockInvoke).toHaveBeenCalledWith('check-price-bhphoto', {
        body: {
          product_id: 'prod-mic',
          source: 'manual',
          manual_url: 'https://www.bhphotovideo.com/c/product/456-mic.html',
        },
      })
      expect(result.status).toBe('ok')
      expect(result.sku_matched).toBe(true)
      expect(result.url_used).toBe('https://www.bhphotovideo.com/c/product/456-mic.html')
    } finally {
      supabase.functions.invoke = originalInvoke
    }
  })

  it('rebateDiscountService updates native rebate fields in products and preserves price_usd', async () => {
    const { rebateDiscountService } = await import('@/services/rebateDiscountService')

    let updatedProductPayload: any = null

    const mockProductSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'prod-canon-c70',
            price_usd: 5499.0,
            price_cost: 4500.0,
          },
          error: null,
        }),
      })),
    }))

    const mockProductUpdate = vi.fn((payload) => {
      updatedProductPayload = payload
      return {
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const mockDiscountsSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    }))

    const { supabase } = await import('@/lib/supabase/client')
    const originalFrom = supabase.from
    supabase.from = vi.fn((table: any) => {
      if (table === 'products') {
        return {
          select: mockProductSelect,
          update: mockProductUpdate,
        } as any
      }
      if (table === 'discounts') {
        return {
          select: mockDiscountsSelect,
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        } as any
      }
      return originalFrom(table)
    }) as any

    try {
      // 1. Salvar rebate nativo percentual (10% sobre 5499 = 4949.10)
      const result = await rebateDiscountService.saveRebateDiscount({
        productId: 'prod-canon-c70',
        productName: 'Canon EOS C70 Cinema Camera',
        discountType: 'percentage',
        discountValue: 10,
        endDate: '2026-10-31T23:59:00.000Z',
      })

      expect(result).toBeDefined()
      expect(result.priceUsaRebate).toBe(4949.1)
      expect(updatedProductPayload).toBeDefined()
      expect(updatedProductPayload.price_usa_rebate).toBe(4949.1)
      expect(updatedProductPayload.price_cost_rebate).toBe(4050.0) // 4500 * (4949.1 / 5499) = 4050
      expect(updatedProductPayload.date_rebate).toBe('2026-10-31T23:59:00.000Z')
      // Regra permanente do usuário: updated_at = last_reviewed_at = agora (mesmo valor)
      expect(updatedProductPayload.updated_at).toBeDefined()
      expect(updatedProductPayload.last_reviewed_at).toBeDefined()
      expect(updatedProductPayload.updated_at).toBe(updatedProductPayload.last_reviewed_at)
      // price_usd NUNCA é alterado
      expect(updatedProductPayload.price_usd).toBeUndefined()
    } finally {
      supabase.from = originalFrom
    }
  })

  it('bhBatchUpdateService.confirmBatchDiscontinued updates is_discontinued=true and aligns updated_at/last_reviewed_at without touching price_usd', async () => {
    let capturedPayload: any = null
    let capturedIds: string[] = []

    const { supabase } = await import('@/lib/supabase/client')
    const originalFrom = supabase.from
    supabase.from = vi.fn((table: any) => {
      if (table === 'products') {
        return {
          update: vi.fn((payload) => {
            capturedPayload = payload
            return {
              in: vi.fn((_col, ids) => {
                capturedIds = ids
                return Promise.resolve({ error: null })
              }),
            }
          }),
        } as any
      }
      return originalFrom(table)
    }) as any

    try {
      const nowIso = await bhBatchUpdateService.confirmBatchDiscontinued(['id-1', 'id-2'])
      expect(nowIso).toBeDefined()
      expect(capturedIds).toEqual(['id-1', 'id-2'])
      expect(capturedPayload.is_discontinued).toBe(true)
      expect(capturedPayload.updated_at).toBe(capturedPayload.last_reviewed_at)
      expect(capturedPayload.price_usd).toBeUndefined()
    } finally {
      supabase.from = originalFrom
    }
  })

  it('bhBatchUpdateService.reactivateBatchProducts updates is_discontinued=false and aligns updated_at/last_reviewed_at without touching price_usd', async () => {
    let capturedPayload: any = null
    let capturedIds: string[] = []

    const { supabase } = await import('@/lib/supabase/client')
    const originalFrom = supabase.from
    supabase.from = vi.fn((table: any) => {
      if (table === 'products') {
        return {
          update: vi.fn((payload) => {
            capturedPayload = payload
            return {
              in: vi.fn((_col, ids) => {
                capturedIds = ids
                return Promise.resolve({ error: null })
              }),
            }
          }),
        } as any
      }
      return originalFrom(table)
    }) as any

    try {
      const nowIso = await bhBatchUpdateService.reactivateBatchProducts(['id-3', 'id-4'])
      expect(nowIso).toBeDefined()
      expect(capturedIds).toEqual(['id-3', 'id-4'])
      expect(capturedPayload.is_discontinued).toBe(false)
      expect(capturedPayload.updated_at).toBe(capturedPayload.last_reviewed_at)
      expect(capturedPayload.price_usd).toBeUndefined()
    } finally {
      supabase.from = originalFrom
    }
  })
})
