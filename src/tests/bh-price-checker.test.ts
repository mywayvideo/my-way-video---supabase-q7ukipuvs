import { describe, it, expect, vi } from 'vitest'
import { priceCheckService } from '@/services/priceCheckService'

describe('priceCheckService & B&H verification tolerance logic', () => {
  it('calculates divergence within tolerance (1% or US$ 1.00, whichever is greater)', () => {
    const evaluateTolerance = (priceDb: number, priceBh: number) => {
      const diffUsd = Number((priceBh - priceDb).toFixed(2))
      const absDiffUsd = Math.abs(diffUsd)
      const diffPct = Number((((priceBh - priceDb) / priceDb) * 100).toFixed(2))
      const absDiffPct = Math.abs(diffPct)
      const toleranceUsd = Math.max(1.0, priceDb * 0.01)

      const isWithinTolerance = absDiffUsd <= toleranceUsd || absDiffPct <= 1.0
      return {
        status: isWithinTolerance ? 'ok' : 'divergente',
        diffUsd,
        diffPct,
      }
    }

    // Caso 1: Produto de $50, diferença de $0.80 (1.6% mas <= $1.00) -> OK pela tolerância de $1.00
    expect(evaluateTolerance(50, 50.8).status).toBe('ok')

    // Caso 2: Produto de $50, diferença de $1.50 (3% e > $1.00) -> DIVERGENTE
    expect(evaluateTolerance(50, 51.5).status).toBe('divergente')

    // Caso 3: Produto de $2000, diferença de $15 (0.75%, abaixo de 1% que é $20) -> OK
    expect(evaluateTolerance(2000, 2015).status).toBe('ok')

    // Caso 4: Produto de $2000, diferença de $25 (1.25%, acima de 1%) -> DIVERGENTE
    expect(evaluateTolerance(2000, 2025).status).toBe('divergente')
  })

  it('normalizes SKU correctly for strict comparison', () => {
    const normalizeSku = (sku: string) => {
      return String(sku)
        .toUpperCase()
        .replace(/^MFR\s*#\s*/i, '')
        .replace(/[^A-Z0-9]/g, '')
    }

    expect(normalizeSku('MFR # DV/RESFB/BRNK')).toBe('DVRESFBBRNK')
    expect(normalizeSku('dv-resfb-brnk')).toBe('DVRESFBBRNK')
    expect(normalizeSku('CONVCMIC/HS03G/WPSU')).toBe('CONVCMICHS03GWPSU')
    expect(normalizeSku('ILME-FX3')).toBe('ILMEFX3')
  })

  it('invokes check-price-bhphoto edge function via service', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: {
        status: 'ok',
        price_usd_cadastrado: 545,
        price_bh: 545,
        diff_usd: 0,
        diff_pct: 0,
        url_used: 'https://www.bhphotovideo.com/c/product/example.html',
        url_discovered: false,
        message: 'Preço conferido com a B&H.',
      },
      error: null,
    })

    // Mocking supabase function invoke
    const { supabase } = await import('@/lib/supabase/client')
    const originalInvoke = supabase.functions.invoke
    supabase.functions.invoke = mockInvoke as any

    try {
      const result = await priceCheckService.checkBhPrice('test-prod-id')
      expect(mockInvoke).toHaveBeenCalledWith('check-price-bhphoto', {
        body: {
          product_id: 'test-prod-id',
          source: 'manual',
        },
      })
      expect(result.status).toBe('ok')
      expect(result.price_bh).toBe(545)
    } finally {
      supabase.functions.invoke = originalInvoke
    }
  })
})
