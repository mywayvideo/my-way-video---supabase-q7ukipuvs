import { describe, it, expect, vi } from 'vitest'
import {
  bhBatchUpdateService,
  ProductBatchItem,
} from '@/services/bhBatchUpdateService'
import { priceCheckService } from '@/services/priceCheckService'

describe('B&H Batch Update Service & Business Rules', () => {
  it('estimates Firecrawl credits: 1 credit with link, 2 credits without link', () => {
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
    // 2 * 1 + 3 * 2 = 8
    expect(estimate.totalCredits).toBe(8)
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
        rebate_end_date: 'Ends Apr 30',
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
      expect(result.rebate_end_date).toBe('Ends Apr 30')
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
})
