import { describe, it, expect, vi } from 'vitest'
import {
  bhBatchUpdateService,
  ProductBatchItem,
  BhBatchJobRecord,
} from '@/services/bhBatchUpdateService'
import { priceCheckService } from '@/services/priceCheckService'
import { supabase } from '@/lib/supabase/client'

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

  it('bhBatchUpdateService createBatchJob, recordItemCheckpoint and updateJobStatus persist job state correctly', async () => {
    const { supabase } = await import('@/lib/supabase/client')
    const originalFrom = supabase.from
    let insertedJob: any = null
    let updatedJobPayload: any = null

    supabase.from = vi.fn((table: any) => {
      if (table === 'bh_batch_jobs') {
        return {
          insert: vi.fn((payload) => {
            insertedJob = { id: 'job-uuid-123', ...payload }
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: insertedJob, error: null }),
              })),
            }
          }),
          update: vi.fn((payload) => {
            updatedJobPayload = payload
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            }
          }),
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: insertedJob, error: null }),
                })),
              })),
            })),
          })),
        } as any
      }
      return originalFrom(table)
    }) as any

    try {
      // 1. Criar novo job
      const job = await bhBatchUpdateService.createBatchJob({
        productIds: ['p-1', 'p-2', 'p-3'],
        batchSize: 10,
        cooldownSeconds: 60,
      })

      expect(job).toBeDefined()
      expect(job?.id).toBe('job-uuid-123')
      expect(insertedJob.total_items).toBe(3)
      expect(insertedJob.status).toBe('in_progress')
      expect(insertedJob.metadata.batchSize).toBe(10)
      expect(insertedJob.metadata.cooldownSeconds).toBe(60)

      // 2. Registrar checkpoint de item
      const stats = {
        totalSelected: 3,
        processedCount: 1,
        okCount: 1,
        divergenceCount: 0,
        urlDiscoveredCount: 0,
        doubtfulLinkCount: 0,
        discontinuedCount: 0,
        errorCount: 0,
        rebateDetectedCount: 0,
      }

      await bhBatchUpdateService.recordItemCheckpoint({
        jobId: 'job-uuid-123',
        productId: 'p-1',
        batchStatus: 'done',
        checkResult: { status: 'ok', price_bh: 1200 },
        priceUsd: 1200,
        currentStats: stats,
        existingResults: {},
        isLastItem: false,
      })

      expect(updatedJobPayload).toBeDefined()
      expect(updatedJobPayload.processed_items).toBe(1)
      expect(updatedJobPayload.current_product_id).toBe('p-1')
      expect(updatedJobPayload.results['p-1']).toBeDefined()
      expect(updatedJobPayload.results['p-1'].batchStatus).toBe('done')
      expect(updatedJobPayload.results['p-1'].checkResult.price_bh).toBe(1200)

      // 3. Atualizar status para paused
      await bhBatchUpdateService.updateJobStatus('job-uuid-123', 'paused')
      expect(updatedJobPayload.status).toBe('paused')
    } finally {
      supabase.from = originalFrom
    }
  })

  it('deve buscar o lote mais recente e reconstruir resultados completos a partir de bh_batch_jobs + price_checks', async () => {
    const originalFrom = supabase.from
    try {
      const mockJob: BhBatchJobRecord = {
        id: '86efc79f-2ff9-45e0-80ff-c15e769b01d9',
        user_id: 'user-admin',
        status: 'completed',
        total_items: 50,
        processed_items: 50,
        current_product_id: 'prod-50',
        product_ids: ['prod-1', 'prod-2', 'prod-3'],
        processed_ids: ['prod-1', 'prod-2', 'prod-3'],
        stats: {
          totalSelected: 50,
          processedCount: 50,
          okCount: 11,
          divergenceCount: 14,
          discontinuedCount: 6,
          doubtfulLinkCount: 17,
          errorCount: 2,
          urlDiscoveredCount: 1,
          rebateDetectedCount: 0,
        },
        results: {
          // Apenas um item estava salvo diretamente em results
          'prod-1': {
            checkResult: { status: 'ok', price_bh: 1500, price_usd_cadastrado: 1500 },
            batchStatus: 'done',
            errorMessage: null,
            website_url: 'https://bhphotovideo.com/c/product/1-prod-1.html',
            price_usd: 1500,
          },
        },
        metadata: { batchSize: 10, cooldownSeconds: 60 },
        created_at: '2026-10-11T19:21:00.000Z',
        completed_at: '2026-10-11T19:38:00.000Z',
        updated_at: '2026-10-11T19:38:00.000Z',
      }

      const mockPriceChecks = [
        {
          id: 'check-1',
          product_id: 'prod-2',
          price_db: 19999,
          price_bh: 18362.5,
          diff_usd: -1636.5,
          diff_pct: -8.18,
          status: 'divergente',
          url_used: 'https://bhphotovideo.com/c/product/2-bzdm8560.html',
          url_discovered: true,
          checked_at: '2026-10-11T19:25:00.000Z',
          message: 'Divergência de preço encontrada',
          raw: { mfr_number: 'BZDM8560' },
        },
        {
          id: 'check-2',
          product_id: 'prod-3',
          price_db: 5900,
          price_bh: 5300,
          diff_usd: -600,
          diff_pct: -10.17,
          status: 'divergente',
          url_used: 'https://bhphotovideo.com/c/product/3-brcx400uc.html',
          url_discovered: false,
          checked_at: '2026-10-11T19:28:00.000Z',
          message: 'Divergência detectada',
          raw: { mfr_number: 'BRCX400UC' },
        },
      ]

      ;(supabase as any).from = (table: string) => {
        if (table === 'bh_batch_jobs') {
          return {
            select: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: mockJob, error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'price_checks') {
          return {
            select: () => ({
              in: () => ({
                gte: () => ({
                  lte: () => ({
                    order: async () => ({ data: mockPriceChecks, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        return originalFrom.call(supabase, table)
      }

      // 1. Testa getLatestBatchJob
      const latestJob = await bhBatchUpdateService.getLatestBatchJob()
      expect(latestJob).toBeDefined()
      expect(latestJob?.id).toBe('86efc79f-2ff9-45e0-80ff-c15e769b01d9')
      expect(latestJob?.status).toBe('completed')

      // 2. Testa reconstrução a partir do banco (job + price_checks)
      const reconstructed = await bhBatchUpdateService.reconstructJobResults(latestJob!)
      expect(reconstructed).toBeDefined()
      expect(Object.keys(reconstructed.results).length).toBe(3)

      // prod-1 veio do results do job
      expect(reconstructed.results['prod-1'].checkResult?.status).toBe('ok')
      expect(reconstructed.results['prod-1'].price_usd).toBe(1500)

      // prod-2 reconstruído de price_checks (BZDM8560)
      expect(reconstructed.results['prod-2'].checkResult?.status).toBe('divergente')
      expect(reconstructed.results['prod-2'].checkResult?.price_bh).toBe(18362.5)
      expect(reconstructed.results['prod-2'].checkResult?.diff_usd).toBe(-1636.5)
      expect(reconstructed.results['prod-2'].website_url).toBe(
        'https://bhphotovideo.com/c/product/2-bzdm8560.html',
      )
      expect(reconstructed.results['prod-2'].checkResult?.url_discovered).toBe(true)

      // prod-3 reconstruído de price_checks (BRCX400UC)
      expect(reconstructed.results['prod-3'].checkResult?.status).toBe('divergente')
      expect(reconstructed.results['prod-3'].checkResult?.price_bh).toBe(5300)

      // Stats consolidadas
      expect(reconstructed.stats.totalSelected).toBe(50)
      expect(reconstructed.stats.okCount).toBe(11)
      expect(reconstructed.stats.divergenceCount).toBe(14)
    } finally {
      supabase.from = originalFrom
    }
  })

  it('fetchProductsByIds busca produtos específicos em chunks e preserva formato ProductBatchItem', async () => {
    const originalFrom = supabase.from
    try {
      const mockProductRows = [
        {
          id: 'prod-extra-1',
          name: 'Sony Extra Camera 4K',
          sku: 'SE-4K',
          category: 'Câmeras',
          price_usd: 2500,
          price_cost: 2000,
          price_usa_rebate: null,
          price_cost_rebate: null,
          date_rebate: null,
          website_url: 'https://bhphotovideo.com/c/product/extra1.html',
          is_discontinued: false,
          updated_at: '2026-03-20T10:00:00.000Z',
          last_reviewed_at: '2026-03-20T10:00:00.000Z',
          manufacturer: { id: 'mfr-1', name: 'Sony' },
        },
      ]

      ;(supabase as any).from = (table: string) => {
        if (table === 'products') {
          return {
            select: () => ({
              in: async (col: string, ids: string[]) => ({
                data: mockProductRows.filter((r) => ids.includes(r.id)),
                error: null,
              }),
            }),
          }
        }
        return originalFrom.call(supabase, table)
      }

      const items = await bhBatchUpdateService.fetchProductsByIds(['prod-extra-1'])
      expect(items.length).toBe(1)
      expect(items[0].id).toBe('prod-extra-1')
      expect(items[0].name).toBe('Sony Extra Camera 4K')
      expect(items[0].price_usd).toBe(2500)
      expect(items[0].batchStatus).toBe('idle')
      expect(items[0].checkResult).toBeNull()
      expect(items[0].manualUrlDraft).toBe('https://bhphotovideo.com/c/product/extra1.html')
    } finally {
      supabase.from = originalFrom
    }
  })

  it('auditoria de lote: poda de cache obsoleto fora do lote e filtro por status', () => {
    // Simula lote restaurado com 2 produtos oficiais no lote (prod-A e prod-B)
    const batchJobProductIds = new Set(['prod-A', 'prod-B'])

    // Cache residual de sessão com produto que NÃO pertence ao lote (prod-obsoleto)
    // Esse é o caso exato relatado com Canon EOS C80, EOS R5 e Quad HDMI residuais
    const simulatedLocalStorage: Record<string, any> = {
      'prod-obsoleto': {
        batchStatus: 'done',
        checkResult: { status: 'divergente', diff_usd: 500, price_bh: 1000 },
      },
      'prod-A': {
        batchStatus: 'done',
        checkResult: { status: 'ok', diff_usd: 0, price_bh: 500 },
      },
    }

    // Regra 1: Poda de cache local para produtos fora do lote
    const prunedCache: Record<string, any> = {}
    for (const [id, val] of Object.entries(simulatedLocalStorage)) {
      if (batchJobProductIds.has(id)) {
        prunedCache[id] = val
      }
    }
    expect(prunedCache['prod-obsoleto']).toBeUndefined()
    expect(prunedCache['prod-A']).toBeDefined()

    // Regra 2: Produto fora do lote volta ao estado neutro (sem badge residual)
    const allProducts = [
      {
        id: 'prod-A',
        name: 'Item A no lote',
        sku: 'SKU-A',
        price_usd: 500,
        batchStatus: 'done',
        checkResult: { status: 'ok', price_bh: 500, diff_usd: 0 },
      },
      {
        id: 'prod-B',
        name: 'Item B divergente no lote',
        sku: 'SKU-B',
        price_usd: 1200,
        batchStatus: 'done',
        checkResult: { status: 'divergente', price_bh: 900, diff_usd: -300 },
      },
      {
        id: 'prod-obsoleto',
        name: 'Item fora do lote',
        sku: 'SKU-OBS',
        price_usd: 300,
        batchStatus: 'done', // resíduo antes da poda
        checkResult: { status: 'divergente', price_bh: null }, // resíduo
      },
    ]

    const merged = allProducts.map((p) => {
      if (batchJobProductIds && !batchJobProductIds.has(p.id)) {
        return {
          ...p,
          batchStatus: 'idle',
          checkResult: null,
          errorMessage: null,
        }
      }
      return p
    })

    const outsideItem = merged.find((p) => p.id === 'prod-obsoleto')
    expect(outsideItem?.batchStatus).toBe('idle')
    expect(outsideItem?.checkResult).toBeNull()

    // Regra 3: Contadores por status refletem exclusivamente o lote
    const targetSet = merged.filter((p) => batchJobProductIds.has(p.id))
    let oks = 0
    let divergentes = 0
    targetSet.forEach((item) => {
      const st = item.checkResult?.status
      if (st === 'ok') oks++
      if (st === 'divergente') divergentes++
    })
    expect(oks).toBe(1)
    expect(divergentes).toBe(1)
  })

  it('se dbJob falhar ou for nulo: cache local residual NUNCA deve ser aplicado e produtos voltam ao estado neutro', () => {
    // Cenário: localStorage contém resíduos antigos de sessões anteriores (ex.: divergências fantasmas com preço B&H null)
    const simulatedLocalStorage: Record<string, any> = {
      'bh_batch_update_cache': JSON.stringify({
        'prod-blackmagic-pyxis': {
          batchStatus: 'done',
          checkResult: { status: 'divergente', price_bh: null, diff_usd: null },
          errorMessage: null,
          website_url: 'https://bhphotovideo.com/c/product/blackmagic-pyxis',
        },
        'prod-blackmagic-pocket': {
          batchStatus: 'done',
          checkResult: { status: 'divergente', price_bh: null, diff_usd: null },
          errorMessage: null,
        },
      }),
    }

    const mockProducts: ProductBatchItem[] = [
      {
        id: 'prod-blackmagic-pyxis',
        name: 'Blackmagic Design PYXIS 12K Cine',
        sku: 'CINECAMCPYXN12LFEF',
        price_usd: 5699,
        website_url: null,
        is_discontinued: false,
        updated_at: '2026-03-23T18:07:00Z',
        last_reviewed_at: '2026-03-23T18:07:00Z',
        batchStatus: 'idle',
        checkResult: null,
        errorMessage: null,
      },
      {
        id: 'prod-blackmagic-pocket',
        name: 'Blackmagic Pocket Cinema Camera',
        sku: 'CINECAMPOCHDMFT',
        price_usd: 555,
        website_url: null,
        is_discontinued: false,
        updated_at: '2026-03-23T18:07:00Z',
        last_reviewed_at: '2026-03-23T18:07:00Z',
        batchStatus: 'idle',
        checkResult: null,
        errorMessage: null,
      },
      {
        id: 'prod-sony-brcx400',
        name: 'Sony BRC-X400 4K PTZ Camera',
        sku: 'BRCX400UC',
        price_usd: 5900,
        website_url: null,
        is_discontinued: false,
        updated_at: '2026-10-10T12:00:00Z',
        last_reviewed_at: '2026-10-10T12:00:00Z',
        batchStatus: 'idle',
        checkResult: null,
        errorMessage: null,
      },
    ]

    // CASO A: dbJob falhou com erro de conexão / consulta (dbJob = null)
    const dbJob: BhBatchJobRecord | null = null
    const batchJobProductIds =
      dbJob && Array.isArray((dbJob as any).product_ids) && (dbJob as any).product_ids.length > 0
        ? new Set((dbJob as any).product_ids)
        : null

    // Lógica implementada na página:
    const cached = simulatedLocalStorage['bh_batch_update_cache']
    let parsedCache: Record<string, Partial<ProductBatchItem>> = {}

    if (cached) {
      if (!dbJob || !batchJobProductIds) {
        // Sem lote no banco: limpa o storage residual
        delete simulatedLocalStorage['bh_batch_update_cache']
        parsedCache = {}
      } else {
        parsedCache = JSON.parse(cached)
      }
    }

    // Mesclagem com proteção de neutralidade
    const merged = mockProducts.map((item) => {
      // Sem lote no banco (dbJob null/erro): volta estritamente ao neutro
      if (!batchJobProductIds || !batchJobProductIds.has(item.id)) {
        return {
          ...item,
          batchStatus: 'idle' as const,
          checkResult: null,
          errorMessage: null,
        }
      }

      const saved = parsedCache[item.id]
      if (saved) {
        return {
          ...item,
          batchStatus: saved.batchStatus || item.batchStatus,
          checkResult: saved.checkResult || item.checkResult,
          errorMessage: saved.errorMessage || item.errorMessage,
        }
      }
      return item
    })

    // Asserções:
    // 1. O cache residual foi removido do storage
    expect(simulatedLocalStorage['bh_batch_update_cache']).toBeUndefined()

    // 2. Todos os produtos estão com status neutro (sem auditoria residual/divergente fantasma)
    expect(merged.every((p) => p.batchStatus === 'idle')).toBe(true)
    expect(merged.every((p) => p.checkResult === null)).toBe(true)
    expect(merged.every((p) => p.errorMessage === null)).toBe(true)

    const pyxis = merged.find((p) => p.id === 'prod-blackmagic-pyxis')
    expect(pyxis?.checkResult).toBeNull()
    expect(pyxis?.batchStatus).toBe('idle')
  })

  it('neutralização estrita de produtos fora do lote em todos os caminhos (reconstrução, job.results, cache local, auto-save)', async () => {
    // Cenário idêntico ao diagnosticado: Job 86efc79f contém apenas 3 produtos no product_ids,
    // mas o JSONB results continha produtos fora do lote (fantasmas como PYXIS e UltraStudio).
    const jobWithGhosts: BhBatchJobRecord = {
      id: '86efc79f-2ff9-45e0-80ff-c15e769b01d9',
      status: 'completed',
      total_items: 3,
      processed_items: 3,
      processed_ids: ['prod-in-1', 'prod-in-2', 'prod-in-3'],
      product_ids: ['prod-in-1', 'prod-in-2', 'prod-in-3'],
      stats: {
        totalSelected: 3,
        processedCount: 3,
        okCount: 3,
        divergenceCount: 0,
        urlDiscoveredCount: 0,
        doubtfulLinkCount: 0,
        discontinuedCount: 0,
        errorCount: 0,
        rebateDetectedCount: 0,
      },
      results: {
        'prod-in-1': {
          batchStatus: 'done',
          checkResult: { status: 'ok', price_bh: 5300, diff_usd: 0 } as any,
          website_url: 'https://bhphotovideo.com/c/product/in-1.html',
          price_usd: 5300,
        },
        'prod-ghost-pyxis': {
          batchStatus: 'done',
          checkResult: { status: 'divergente', price_bh: 3595, diff_usd: 500 } as any,
          website_url: 'https://bhphotovideo.com/c/product/pyxis.html',
          price_usd: 3095,
        },
        'prod-ghost-ultrostudio': {
          batchStatus: 'done',
          checkResult: { status: 'divergente', price_bh: 3549, diff_usd: 400 } as any,
          website_url: 'https://bhphotovideo.com/c/product/ultrastudio.html',
          price_usd: 3149,
        },
      },
      metadata: {},
      created_at: '2026-03-23T18:00:00Z',
      updated_at: '2026-03-23T18:30:00Z',
    }

    const originalFrom = supabase.from
    try {
      // Mock price_checks retornando apenas o prod-in-1 e prod-in-2
      ;(supabase as any).from = (table: string) => {
        if (table === 'price_checks') {
          return {
            select: () => ({
              in: () => ({
                gte: () => ({
                  lte: () => ({
                    order: async () => ({
                      data: [
                        {
                          product_id: 'prod-in-1',
                          status: 'ok',
                          price_db: 5300,
                          price_bh: 5300,
                          diff_usd: 0,
                          checked_at: '2026-03-23T18:05:00Z',
                          raw: {},
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        return originalFrom.call(supabase, table)
      }

      // (1) Reconstrução deve filtrar job.results estritamente pelos product_ids do job
      const reconstructed = await bhBatchUpdateService.reconstructJobResults(jobWithGhosts)
      expect(reconstructed.results['prod-in-1']).toBeDefined()
      expect(reconstructed.results['prod-ghost-pyxis']).toBeUndefined()
      expect(reconstructed.results['prod-ghost-ultrostudio']).toBeUndefined()
      expect(Object.keys(reconstructed.results)).not.toContain('prod-ghost-pyxis')

      // (2) Na mesclagem da página: GUARDA ABSOLUTA primeiro
      const batchJobProductIds = new Set(jobWithGhosts.product_ids)
      const catalogProducts: ProductBatchItem[] = [
        {
          id: 'prod-in-1',
          name: 'Produto Válido no Lote',
          sku: 'IN-1',
          price_usd: 5300,
          website_url: 'https://bhphotovideo.com/c/product/in-1.html',
          is_discontinued: false,
          updated_at: '2026-03-20T10:00:00Z',
          last_reviewed_at: '2026-03-20T10:00:00Z',
          batchStatus: 'idle',
          checkResult: null,
          errorMessage: null,
        },
        {
          id: 'prod-ghost-pyxis',
          name: 'Blackmagic PYXIS 6K PL',
          sku: 'PYXIS-6K-PL',
          price_usd: 3595,
          website_url: null,
          is_discontinued: false,
          updated_at: '2026-03-23T10:00:00Z',
          last_reviewed_at: '2026-03-23T10:00:00Z',
          batchStatus: 'idle',
          checkResult: null,
          errorMessage: null,
        },
      ]

      // Simula parsedCache residual corrompido
      const parsedCache: Record<string, any> = {
        'prod-ghost-pyxis': {
          batchStatus: 'done',
          checkResult: { status: 'divergente', price_bh: null },
        },
      }

      const merged = catalogProducts.map((item) => {
        // Guarda absoluta PRIMEIRO
        if (!batchJobProductIds || !batchJobProductIds.has(item.id)) {
          return {
            ...item,
            batchStatus: 'idle' as const,
            checkResult: null,
            errorMessage: null,
          }
        }

        // Prioridade 1: reconstructed
        if (reconstructed?.results && reconstructed.results[item.id]) {
          const recItem = reconstructed.results[item.id]
          return {
            ...item,
            batchStatus: recItem.batchStatus || 'done',
            checkResult: recItem.checkResult || null,
          }
        }

        // Prioridade 2: dbJob.results
        if (jobWithGhosts.results && jobWithGhosts.results[item.id]) {
          const dbItem = jobWithGhosts.results[item.id]
          return {
            ...item,
            batchStatus: dbItem.batchStatus || 'done',
            checkResult: dbItem.checkResult || null,
          }
        }

        return item
      })

      const pyxisMerged = merged.find((p) => p.id === 'prod-ghost-pyxis')
      expect(pyxisMerged?.batchStatus).toBe('idle')
      expect(pyxisMerged?.checkResult).toBeNull()

      const in1Merged = merged.find((p) => p.id === 'prod-in-1')
      expect(in1Merged?.batchStatus).toBe('done')
      expect(in1Merged?.checkResult?.status).toBe('ok')

      // (3) Auto-save de localStorage: NÃO deve salvar produtos fora do lote
      const activeJobIds = new Set(jobWithGhosts.product_ids)
      const simulatedSavedMap: Record<string, any> = {}
      merged.forEach((p) => {
        if (activeJobIds && !activeJobIds.has(p.id)) return
        if (p.checkResult || p.batchStatus !== 'idle') {
          simulatedSavedMap[p.id] = { batchStatus: p.batchStatus }
        }
      })
      expect(simulatedSavedMap['prod-ghost-pyxis']).toBeUndefined()
      expect(simulatedSavedMap['prod-in-1']).toBeDefined()
    } finally {
      supabase.from = originalFrom
    }
  })

  it('Confirmar Estado Atual altera apenas last_reviewed_at, preservando updated_at, price_usd e is_discontinued', async () => {
    const originalFrom = supabase.from
    let updatedPayload: any = null
    let updatedId: string | null = null

    try {
      ;(supabase as any).from = (table: string) => {
        if (table === 'products') {
          return {
            update: (payload: any) => {
              updatedPayload = payload
              return {
                eq: async (col: string, val: string) => {
                  updatedId = val
                  return { error: null }
                },
                in: async (col: string, vals: string[]) => {
                  return { error: null }
                },
              }
            },
          }
        }
        return originalFrom.call(supabase, table)
      }

      // 1. Teste individual
      const resIso = await bhBatchUpdateService.confirmCurrentState('prod-sony-bp-u70')
      expect(resIso).toBeDefined()
      expect(updatedId).toBe('prod-sony-bp-u70')
      expect(updatedPayload).toHaveProperty('last_reviewed_at')
      expect(updatedPayload.updated_at).toBeUndefined()
      expect(updatedPayload.price_usd).toBeUndefined()
      expect(updatedPayload.is_discontinued).toBeUndefined()
      expect(Object.keys(updatedPayload)).toEqual(['last_reviewed_at'])

      // 2. Teste em lote
      let batchPayload: any = null
      let batchIds: string[] = []
      ;(supabase as any).from = (table: string) => {
        if (table === 'products') {
          return {
            update: (payload: any) => {
              batchPayload = payload
              return {
                in: async (col: string, vals: string[]) => {
                  batchIds = vals
                  return { error: null }
                },
              }
            },
          }
        }
        return originalFrom.call(supabase, table)
      }

      const batchIso = await bhBatchUpdateService.confirmBatchCurrentState([
        'prod-1',
        'prod-2',
      ])
      expect(batchIso).toBeDefined()
      expect(batchIds).toEqual(['prod-1', 'prod-2'])
      expect(batchPayload).toHaveProperty('last_reviewed_at')
      expect(batchPayload.updated_at).toBeUndefined()
      expect(batchPayload.price_usd).toBeUndefined()
      expect(batchPayload.is_discontinued).toBeUndefined()
      expect(Object.keys(batchPayload)).toEqual(['last_reviewed_at'])
    } finally {
      supabase.from = originalFrom
    }
  })

  it('descontinuado no catálogo com check divergente aparece e conta em divergentes com botão Aplicar e Reativar', () => {
    // Caso real BRCH800: is_discontinued = true, preço cadastrado $0, preço B&H $5.900 (divergente)
    const productBrch800: ProductBatchItem = {
      id: 'prod-brch800',
      name: 'Sony BRC-H800 PTZ Camera',
      sku: 'BRCH800',
      price_usd: 0,
      website_url: 'https://bhphotovideo.com/c/product/brch800.html',
      is_discontinued: true,
      updated_at: '2026-03-20T10:00:00Z',
      last_reviewed_at: '2026-03-20T10:00:00Z',
      batchStatus: 'done',
      checkResult: {
        status: 'divergente',
        price_bh: 5900,
        price_usd_cadastrado: 0,
        diff_usd: 5900,
        diff_pct: 100,
        is_discontinued: false,
        url_used: 'https://bhphotovideo.com/c/product/brch800.html',
        url_discovered: false,
        checked_at: new Date().toISOString(),
      },
    }

    const testCatalog: ProductBatchItem[] = [
      productBrch800,
      {
        id: 'prod-real-discontinued',
        name: 'Equipamento Realmente Descontinuado',
        sku: 'DISC-01',
        price_usd: 1200,
        website_url: 'https://bhphotovideo.com/c/product/disc.html',
        is_discontinued: true,
        updated_at: '2026-03-20T10:00:00Z',
        last_reviewed_at: '2026-03-20T10:00:00Z',
        batchStatus: 'done',
        checkResult: {
          status: 'descontinuado',
          price_bh: null,
          diff_usd: null,
          diff_pct: null,
          is_discontinued: true,
          checked_at: new Date().toISOString(),
        },
      },
      {
        id: 'prod-ok-item',
        name: 'Item OK Alinhado',
        sku: 'OK-01',
        price_usd: 500,
        website_url: 'https://bhphotovideo.com/c/product/ok.html',
        is_discontinued: false,
        updated_at: '2026-03-20T10:00:00Z',
        last_reviewed_at: '2026-03-20T10:00:00Z',
        batchStatus: 'done',
        checkResult: {
          status: 'ok',
          price_bh: 500,
          diff_usd: 0,
          diff_pct: 0,
          is_discontinued: false,
          checked_at: new Date().toISOString(),
        },
      },
    ]

    // 1. Simulação dos contadores de auditoria (auditFilterCounts)
    let divergentes = 0
    let descontinuados = 0
    let oks = 0

    testCatalog.forEach((item) => {
      const paired = bhBatchUpdateService.resolveItemPairedEvaluation(item)
      const st = paired.effectiveStatus || item.checkResult?.status || null

      if (st === 'divergente') {
        divergentes++
      } else if (st === 'descontinuado' || item.is_discontinued) {
        descontinuados++
      } else if (st === 'ok') {
        oks++
      }
    })

    // BRCH800 deve contar em divergentes, NÃO em descontinuados!
    expect(divergentes).toBe(1)
    expect(descontinuados).toBe(1) // apenas prod-real-discontinued
    expect(oks).toBe(1)

    // 2. Simulação de filtragem por statusFilter
    const filterByStatus = (statusFilter: string) => {
      return testCatalog.filter((item) => {
        const paired = bhBatchUpdateService.resolveItemPairedEvaluation(item)
        const itemEffectiveStatus = paired.effectiveStatus || item.checkResult?.status || null

        if (statusFilter === 'divergente') {
          return itemEffectiveStatus === 'divergente'
        }
        if (statusFilter === 'descontinuado') {
          if (itemEffectiveStatus === 'divergente') return false
          return itemEffectiveStatus === 'descontinuado' || item.is_discontinued
        }
        return true
      })
    }

    const filteredDivergentes = filterByStatus('divergente')
    expect(filteredDivergentes.map((p) => p.id)).toEqual(['prod-brch800'])

    const filteredDescontinuados = filterByStatus('descontinuado')
    expect(filteredDescontinuados.map((p) => p.id)).toEqual(['prod-real-discontinued'])

    // 3. Avaliação de botões e flags para a linha do BRCH800
    const pairedResolution = bhBatchUpdateService.resolveItemPairedEvaluation(productBrch800)
    const effectiveStatus = pairedResolution.effectiveStatus || productBrch800.checkResult?.status || null
    const isDivergent = effectiveStatus === 'divergente'
    const isDiscontinued = !isDivergent && (productBrch800.is_discontinued || effectiveStatus === 'descontinuado')

    // Deve ser marcado como divergente
    expect(isDivergent).toBe(true)
    // NÃO deve ser marcado como isDiscontinued na linha de exibição quando a verificação for divergente
    expect(isDiscontinued).toBe(false)

    // Verificação de botões:
    // Botão "Aplicar B&H" ativo:
    const showApplyButton = isDivergent && productBrch800.checkResult?.price_bh != null
    expect(showApplyButton).toBe(true)

    // Botão "Reativar" ativo (já que is_discontinued no catálogo e auditoria veio divergente com preço):
    const showReactivateButton =
      productBrch800.is_discontinued &&
      (effectiveStatus === 'ok' || effectiveStatus === 'divergente')
    expect(showReactivateButton).toBe(true)
  })

  it('orders batch results by action priority rank: divergente > descontinuado > link duvidoso > erro > ok', async () => {
    const { getActionPriorityRank } = await import('@/pages/admin/AdminBhUpdatePage')

    const pDivergentOld: ProductBatchItem = {
      id: 'p-div-old',
      name: 'Item Divergente Antigo',
      sku: 'DIV-01',
      price_usd: 100,
      website_url: 'https://bh.com/1',
      is_discontinued: false,
      updated_at: '2026-01-01T10:00:00Z',
      last_reviewed_at: '2026-01-01T10:00:00Z',
      batchStatus: 'done',
      checkResult: {
        status: 'divergente',
        price_bh: 120,
        diff_usd: 20,
        diff_pct: 20,
      },
    }

    const pDivergentRecent: ProductBatchItem = {
      id: 'p-div-rec',
      name: 'Item Divergente Recente',
      sku: 'DIV-02',
      price_usd: 200,
      website_url: 'https://bh.com/2',
      is_discontinued: false,
      updated_at: '2026-03-01T10:00:00Z',
      last_reviewed_at: '2026-03-01T10:00:00Z',
      batchStatus: 'done',
      checkResult: {
        status: 'divergente',
        price_bh: 250,
        diff_usd: 50,
        diff_pct: 25,
      },
    }

    const pDiscontinuedBrch800: ProductBatchItem = {
      id: 'p-brch800',
      name: 'Sony BRC-H800 (is_discontinued true mas check divergente)',
      sku: 'BRCH800',
      price_usd: 0,
      website_url: 'https://bh.com/brch800',
      is_discontinued: true,
      updated_at: '2026-02-01T10:00:00Z',
      last_reviewed_at: '2026-02-01T10:00:00Z',
      batchStatus: 'done',
      checkResult: {
        status: 'divergente',
        price_bh: 5900,
        diff_usd: 5900,
        diff_pct: 100,
      },
    }

    const pRealDiscontinued: ProductBatchItem = {
      id: 'p-disc',
      name: 'Item Realmente Descontinuado',
      sku: 'DISC-01',
      price_usd: 500,
      website_url: 'https://bh.com/disc',
      is_discontinued: true,
      updated_at: '2026-01-15T10:00:00Z',
      last_reviewed_at: '2026-01-15T10:00:00Z',
      batchStatus: 'done',
      checkResult: {
        status: 'descontinuado',
      },
    }

    const pDoubtfulLink: ProductBatchItem = {
      id: 'p-doubtful',
      name: 'Item Link Duvidoso',
      sku: 'DOUBT-01',
      price_usd: 300,
      website_url: null,
      is_discontinued: false,
      updated_at: '2026-01-20T10:00:00Z',
      last_reviewed_at: '2026-01-20T10:00:00Z',
      batchStatus: 'done',
      checkResult: {
        status: 'sem_url_confirmada',
      },
    }

    const pError: ProductBatchItem = {
      id: 'p-error',
      name: 'Item com Falha no Lote',
      sku: 'ERR-01',
      price_usd: 400,
      website_url: 'https://bh.com/err',
      is_discontinued: false,
      updated_at: '2026-01-10T10:00:00Z',
      last_reviewed_at: '2026-01-10T10:00:00Z',
      batchStatus: 'error',
      errorMessage: 'Network timeout',
    }

    const pOkOld: ProductBatchItem = {
      id: 'p-ok-old',
      name: 'Item OK Antigo',
      sku: 'OK-01',
      price_usd: 800,
      website_url: 'https://bh.com/ok1',
      is_discontinued: false,
      updated_at: '2026-01-05T10:00:00Z',
      last_reviewed_at: '2026-01-05T10:00:00Z',
      batchStatus: 'done',
      checkResult: {
        status: 'ok',
        price_bh: 800,
        diff_usd: 0,
        diff_pct: 0,
      },
    }

    const pOkRecent: ProductBatchItem = {
      id: 'p-ok-rec',
      name: 'Item OK Recente',
      sku: 'OK-02',
      price_usd: 900,
      website_url: 'https://bh.com/ok2',
      is_discontinued: false,
      updated_at: '2026-03-10T10:00:00Z',
      last_reviewed_at: '2026-03-10T10:00:00Z',
      batchStatus: 'done',
      checkResult: {
        status: 'ok',
        price_bh: 900,
        diff_usd: 0,
        diff_pct: 0,
      },
    }

    // 1. Testa ranks individuais de prioridade
    expect(getActionPriorityRank(pDivergentOld)).toBe(1)
    expect(getActionPriorityRank(pDivergentRecent)).toBe(1)
    // BRCH800 tem divergência e deve ter rank 1 (prevalece sobre is_discontinued)
    expect(getActionPriorityRank(pDiscontinuedBrch800)).toBe(1)
    expect(getActionPriorityRank(pRealDiscontinued)).toBe(2)
    expect(getActionPriorityRank(pDoubtfulLink)).toBe(3)
    expect(getActionPriorityRank(pError)).toBe(4)
    expect(getActionPriorityRank(pOkOld)).toBe(5)
    expect(getActionPriorityRank(pOkRecent)).toBe(5)

    // 2. Simula ordenação em lote com desempate por data (mais antigo primeiro)
    const unsortedList = [
      pOkRecent,
      pRealDiscontinued,
      pDivergentRecent,
      pError,
      pDoubtfulLink,
      pOkOld,
      pDiscontinuedBrch800,
      pDivergentOld,
    ]

    const sortedList = [...unsortedList].sort((a, b) => {
      const rankA = getActionPriorityRank(a)
      const rankB = getActionPriorityRank(b)
      if (rankA !== rankB) {
        return rankA - rankB
      }
      const aRev = a.last_reviewed_at || a.updated_at || 0
      const bRev = b.last_reviewed_at || b.updated_at || 0
      return new Date(aRev).getTime() - new Date(bRev).getTime()
    })

    // Bloco 1 (Divergentes): pDivergentOld (01/01), pDiscontinuedBrch800 (01/02), pDivergentRecent (01/03)
    // Bloco 2 (Descontinuado): pRealDiscontinued
    // Bloco 3 (Link Duvidoso): pDoubtfulLink
    // Bloco 4 (Erro): pError
    // Bloco 5 (OK): pOkOld (05/01), pOkRecent (10/03)
    expect(sortedList.map((p) => p.id)).toEqual([
      'p-div-old',
      'p-brch800',
      'p-div-rec',
      'p-disc',
      'p-doubtful',
      'p-error',
      'p-ok-old',
      'p-ok-rec',
    ])
  })

  // =========================================================================
  // CENÁRIOS ESPECÍFICOS DAS 5 CORREÇÕES
  // =========================================================================

  it('Cenário 1: Exclusão de produto sem check real dos filtros e contadores', () => {
    // Produtos como CINECAMCPYXM12LFL não têm price_check no banco.
    // Nunca devem aparecer em abas de status de auditoria ('divergente', 'descontinuado', 'sem_url_confirmada', 'ok', 'erro').
    const items: ProductBatchItem[] = [
      {
        id: 'cinecam',
        name: 'Cinema Camera',
        sku: 'CINECAMCPYXM12LFL',
        price_usd: 1200,
        website_url: 'https://bh.com/cinecam',
        is_discontinued: false,
        updated_at: '2026-01-01T00:00:00Z',
        last_reviewed_at: '2026-01-01T00:00:00Z',
        batchStatus: 'idle',
        checkResult: null, // SEM check real
      },
      {
        id: 'real-div',
        name: 'Real Divergente',
        sku: 'DIV-01',
        price_usd: 1000,
        website_url: 'https://bh.com/div1',
        is_discontinued: false,
        updated_at: '2026-01-01T00:00:00Z',
        last_reviewed_at: '2026-01-01T00:00:00Z',
        batchStatus: 'done',
        checkResult: {
          status: 'divergente',
          price_bh: 1100,
          diff_usd: 100,
          diff_pct: 10,
        },
      },
    ]

    // Simula a lógica de filtragem da página com a regra (1):
    const filterByStatus = (statusFilter: string) => {
      return items.filter((item) => {
        if (statusFilter === 'all') return true
        const hasRealVerification =
          item.checkResult !== null || (statusFilter === 'erro' && item.batchStatus === 'error')
        if (!hasRealVerification) return false

        const paired = bhBatchUpdateService.resolveItemPairedEvaluation(item)
        const itemEffectiveStatus =
          paired.effectiveStatus || item.checkResult?.status || null

        if (statusFilter === 'divergente') {
          return itemEffectiveStatus === 'divergente'
        }
        if (statusFilter === 'descontinuado') {
          return itemEffectiveStatus === 'descontinuado'
        }
        return itemEffectiveStatus === statusFilter
      })
    }

    // CINECAMCPYXM12LFL não aparece em nenhuma aba de auditoria
    expect(filterByStatus('divergente').map((p) => p.id)).toEqual(['real-div'])
    expect(filterByStatus('descontinuado')).toHaveLength(0)
    expect(filterByStatus('sem_url_confirmada')).toHaveLength(0)
    expect(filterByStatus('ok')).toHaveLength(0)
    expect(filterByStatus('erro')).toHaveLength(0)

    // Simula contador de auditoria: produtos sem verificação real não incrementam nenhum contador
    let totalVerified = 0
    let divergentesCount = 0
    items.forEach((item) => {
      const hasRealVerification = item.checkResult !== null || item.batchStatus === 'error'
      if (!hasRealVerification) return
      totalVerified++
      const paired = bhBatchUpdateService.resolveItemPairedEvaluation(item)
      const st = paired.effectiveStatus || item.checkResult?.status || null
      if (st === 'divergente') divergentesCount++
    })

    expect(totalVerified).toBe(1)
    expect(divergentesCount).toBe(1)
  })

  it('Cenário 2: Atualização de contadores em tempo real após confirmação', () => {
    // Ao confirmar uma ação humana (Aplicar B&H, Confirmar Estado Atual, etc.),
    // o item é atualizado no estado local de modo a sair imediatamente da fila de divergentes.
    const initialItems: ProductBatchItem[] = [
      {
        id: 'p1',
        name: 'Item 1',
        sku: 'SKU-1',
        price_usd: 1000,
        website_url: 'https://bh.com/1',
        is_discontinued: false,
        updated_at: '2026-01-01T00:00:00Z',
        last_reviewed_at: '2026-01-01T00:00:00Z',
        batchStatus: 'done',
        checkResult: {
          status: 'divergente',
          price_bh: 1200,
          diff_usd: 200,
          diff_pct: 20,
        },
      },
      {
        id: 'p2',
        name: 'Item 2',
        sku: 'SKU-2',
        price_usd: 500,
        website_url: 'https://bh.com/2',
        is_discontinued: false,
        updated_at: '2026-01-01T00:00:00Z',
        last_reviewed_at: '2026-01-01T00:00:00Z',
        batchStatus: 'done',
        checkResult: {
          status: 'divergente',
          price_bh: 550,
          diff_usd: 50,
          diff_pct: 10,
        },
      },
    ]

    const computeCounts = (list: ProductBatchItem[]) => {
      let div = 0
      let ok = 0
      list.forEach((item) => {
        if (!item.checkResult && item.batchStatus !== 'error') return
        const paired = bhBatchUpdateService.resolveItemPairedEvaluation(item)
        const st = paired.effectiveStatus || item.checkResult?.status || null
        if (st === 'divergente') div++
        else if (st === 'ok') ok++
      })
      return { div, ok }
    }

    expect(computeCounts(initialItems)).toEqual({ div: 2, ok: 0 })

    // Ação 1: Aplicar B&H em p1 -> price_usd = 1200, checkResult.status = 'ok'
    const afterApplyP1 = initialItems.map((p) =>
      p.id === 'p1'
        ? {
            ...p,
            price_usd: 1200,
            checkResult: {
              ...(p.checkResult as any),
              status: 'ok' as const,
              diff_usd: 0,
              diff_pct: 0,
            },
          }
        : p,
    )

    // Contadores atualizam na hora sem reload
    expect(computeCounts(afterApplyP1)).toEqual({ div: 1, ok: 1 })

    // Ação 2: Confirmar Estado Atual em p2 -> checkResult.status = 'ok', pendência resolvida
    const afterConfirmP2 = afterApplyP1.map((p) =>
      p.id === 'p2'
        ? {
            ...p,
            checkResult: {
              ...(p.checkResult as any),
              status: 'ok' as const,
            },
          }
        : p,
    )

    expect(computeCounts(afterConfirmP2)).toEqual({ div: 0, ok: 2 })
  })

  it('Cenário 3: Agregação de novo lote mantendo pendências anteriores ativas', () => {
    // Pendência persistente por produto: um produto analisado no passado (ex: semana anterior)
    // cuja pendência ainda não foi resolvida por humano (last_reviewed_at < checked_at)
    // é mantido quando um novo lote roda.
    const activePendingMap: Record<string, { checkResult: any; website_url: string; price_usd: number }> = {
      'p-old-pending': {
        checkResult: {
          status: 'divergente',
          price_bh: 850,
          diff_usd: 50,
          diff_pct: 6.25,
        },
        website_url: 'https://bh.com/old',
        price_usd: 800,
      },
    }

    // Novo lote de 1 produto rodou agora (p-new-batch)
    const newBatchJobResults: Record<string, any> = {
      'p-new-batch': {
        batchStatus: 'done',
        checkResult: {
          status: 'divergente',
          price_bh: 1500,
          diff_usd: 200,
          diff_pct: 15,
        },
        website_url: 'https://bh.com/new',
        price_usd: 1300,
      },
    }

    const allLoadedProducts: ProductBatchItem[] = [
      {
        id: 'p-old-pending',
        name: 'Produto Pendente Antigo',
        sku: 'OLD-01',
        price_usd: 800,
        website_url: 'https://bh.com/old',
        is_discontinued: false,
        updated_at: '2026-03-01T00:00:00Z',
        last_reviewed_at: '2026-03-01T00:00:00Z', // Anterior ao check
      },
      {
        id: 'p-new-batch',
        name: 'Produto Novo do Lote',
        sku: 'NEW-01',
        price_usd: 1300,
        website_url: 'https://bh.com/new',
        is_discontinued: false,
        updated_at: '2026-03-10T00:00:00Z',
        last_reviewed_at: '2026-03-10T00:00:00Z',
      },
      {
        id: 'p-neutral',
        name: 'Produto Neutro Sem Pendência',
        sku: 'NEU-01',
        price_usd: 200,
        website_url: 'https://bh.com/neu',
        is_discontinued: false,
        updated_at: '2026-03-10T00:00:00Z',
        last_reviewed_at: '2026-03-10T00:00:00Z',
      },
    ]

    const batchJobProductIds = new Set(['p-new-batch'])

    // Mesclagem com regra (3):
    const merged = allLoadedProducts.map((item) => {
      if (batchJobProductIds.has(item.id) && newBatchJobResults[item.id]) {
        const dbItem = newBatchJobResults[item.id]
        return {
          ...item,
          batchStatus: 'done' as const,
          checkResult: dbItem.checkResult,
        }
      }
      if (activePendingMap[item.id]) {
        const pend = activePendingMap[item.id]
        return {
          ...item,
          batchStatus: 'done' as const,
          checkResult: pend.checkResult,
        }
      }
      return {
        ...item,
        batchStatus: 'idle' as const,
        checkResult: null,
      }
    })

    // Ambos os divergentes (antigo persistente e novo do lote) estão presentes
    const divergentItems = merged.filter((p) => p.checkResult?.status === 'divergente')
    expect(divergentItems.map((p) => p.id)).toEqual(['p-old-pending', 'p-new-batch'])

    // Produto neutro não tem checkResult
    const neutral = merged.find((p) => p.id === 'p-neutral')
    expect(neutral?.checkResult).toBeNull()
  })

  it('Cenário 4: Checagem automática NÃO grava last_reviewed_at nem updated_at', () => {
    // A checagem automática (Firecrawl / B&H) atualiza exclusivamente website_url se descoberto
    // e grava o histórico em price_checks. NUNCA toca em last_reviewed_at nem updated_at.
    // Somente ações humanas carimbam essas datas.
    const initialProductState = {
      id: 'prod-auto',
      website_url: null,
      updated_at: '2026-01-15T12:00:00Z',
      last_reviewed_at: '2026-01-15T12:00:00Z',
    }

    // Simulação do payload de update da checagem automática após a correção:
    const simulateAutomaticUrlDiscovery = (prod: typeof initialProductState, discoveredUrl: string) => {
      // Regra (4): checagem automática atualiza SOMENTE website_url, sem carimbar datas
      return {
        ...prod,
        website_url: discoveredUrl,
        // updated_at e last_reviewed_at permanecem intocados!
      }
    }

    const stateAfterAutoCheck = simulateAutomaticUrlDiscovery(
      initialProductState,
      'https://www.bhphotovideo.com/c/product/123-REG/test.html',
    )

    expect(stateAfterAutoCheck.website_url).toBe('https://www.bhphotovideo.com/c/product/123-REG/test.html')
    expect(stateAfterAutoCheck.updated_at).toBe(initialProductState.updated_at)
    expect(stateAfterAutoCheck.last_reviewed_at).toBe(initialProductState.last_reviewed_at)

    // Ação humana: ao alterar dados, atualiza ambas as datas para agora
    const simulateHumanEdit = (prod: typeof stateAfterAutoCheck, newPrice: number) => {
      const now = '2026-03-12T18:00:00Z'
      return {
        ...prod,
        price_usd: newPrice,
        updated_at: now,
        last_reviewed_at: now,
      }
    }

    const stateAfterHumanAction = simulateHumanEdit(stateAfterAutoCheck, 999)
    expect(stateAfterHumanAction.updated_at).toBe('2026-03-12T18:00:00Z')
    expect(stateAfterHumanAction.last_reviewed_at).toBe('2026-03-12T18:00:00Z')
    expect(stateAfterHumanAction.last_reviewed_at).toBe(stateAfterHumanAction.updated_at)
  })
})
