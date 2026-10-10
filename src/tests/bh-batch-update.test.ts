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
    // Sony AN820A: Cadastrado US$ 282, regra Rebate Fabricante fixa US$ 123 (efetivo US$ 159).
    // B&H retorna: price_bh 159, price_full 282, price_with_rebate 159, rebate_active true.
    const sonyAn820Item: ProductBatchItem = {
      id: 'prod-sony-an820a',
      name: 'Sony AN-820A Active Dipole Antenna',
      sku: 'AN820A',
      price_usd: 282,
      website_url: 'https://www.bhphotovideo.com/c/product/68297-REG/Sony_AN820A_AN_820A_Active_Antenna.html',
      is_discontinued: false,
      updated_at: '2026-10-01',
      last_reviewed_at: '2026-10-01',
      batchStatus: 'done',
      checkResult: {
        status: 'divergente', // Se edge function mandasse divergente por comparação simples 282 x 159 (-43.62%)
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

    const rebateRule = {
      id: 'rebate-an820a',
      name: 'Rebate Fabricante',
      discount_type: 'fixed' as const,
      discount_value: 123,
      start_date: '2026-05-01',
      end_date: '2026-05-31',
      is_active: true,
      product_selection: ['prod-sony-an820a'],
    }

    // Sem a regra ativa passada, mantém status retornado
    const resWithoutRule = bhBatchUpdateService.resolveItemPairedEvaluation(sonyAn820Item, null)
    expect(resWithoutRule.effectiveStatus).toBe('divergente')

    // Com a regra ativa passada, avalia pareado: Cheio OK (282 x 282) e Desconto OK (159 x 159) -> OK!
    const resWithRule = bhBatchUpdateService.resolveItemPairedEvaluation(sonyAn820Item, rebateRule)
    expect(resWithRule.effectiveStatus).toBe('ok')
    expect(resWithRule.pairedEval?.overallWithinTolerance).toBe(true)
    expect(resWithRule.pairedEval?.fullPair?.isWithinTolerance).toBe(true)
    expect(resWithRule.pairedEval?.rebatePair?.isWithinTolerance).toBe(true)
    expect(resWithRule.pairedEval?.fullPair?.diffUsd).toBe(0)
    expect(resWithRule.pairedEval?.rebatePair?.diffUsd).toBe(0)

    // Validar se calculateStats computa como OK quando o mapa de regras é fornecido
    const statsWithRebate = bhBatchUpdateService.calculateStats([sonyAn820Item], {
      'prod-sony-an820a': rebateRule,
    })
    expect(statsWithRebate.okCount).toBe(1)
    expect(statsWithRebate.divergenceCount).toBe(0)
    expect(statsWithRebate.rebateDetectedCount).toBe(1)
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

  it('rebateDiscountService creates and updates discounts with fixed name "Rebate Fabricante" and never modifies price_usd', async () => {
    const { rebateDiscountService } = await import('@/services/rebateDiscountService')

    let insertedRecord: any = null
    let updatedRecord: any = null

    const mockInsert = vi.fn((record) => {
      insertedRecord = record
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'disc-1', ...record }, error: null }),
        })),
      }
    })

    const mockUpdate = vi.fn((record) => {
      updatedRecord = record
      return {
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: 'disc-existing', ...record }, error: null }),
          })),
        })),
      }
    })

    const { supabase } = await import('@/lib/supabase/client')
    const originalFrom = supabase.from
    supabase.from = vi.fn((table: any) => {
      if (table === 'discounts') {
        return {
          insert: mockInsert,
          update: mockUpdate,
        } as any
      }
      return originalFrom(table)
    }) as any

    try {
      // 1. Criar novo Rebate Fabricante
      const created = await rebateDiscountService.saveRebateDiscount({
        productId: 'prod-canon-c70',
        productName: 'Canon EOS C70 Cinema Camera',
        discountType: 'percentage',
        discountValue: 12.5,
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-31T23:59:00.000Z',
        isActive: true,
      })

      expect(created).toBeDefined()
      expect(insertedRecord.name).toBe('Rebate Fabricante')
      expect(insertedRecord.target_type).toBe('specific')
      expect(insertedRecord.product_selection).toEqual(['prod-canon-c70'])
      expect(insertedRecord.discount_type).toBe('percentage')
      expect(insertedRecord.discount_value).toBe(12.5)
      expect(insertedRecord.end_date).toBe('2026-10-31T23:59:00.000Z')

      // 2. Atualizar regra existente sem duplicar
      const updated = await rebateDiscountService.saveRebateDiscount({
        productId: 'prod-canon-c70',
        productName: 'Canon EOS C70 Cinema Camera',
        discountType: 'fixed',
        discountValue: 600,
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-11-15T23:59:00.000Z',
        isActive: true,
        existingDiscountId: 'disc-existing',
      })

      expect(updated).toBeDefined()
      expect(updatedRecord.name).toBe('Rebate Fabricante')
      expect(updatedRecord.discount_type).toBe('fixed')
      expect(updatedRecord.discount_value).toBe(600)
      expect(updatedRecord.end_date).toBe('2026-11-15T23:59:00.000Z')
    } finally {
      supabase.from = originalFrom
    }
  })
})
