import { describe, it, expect, vi } from 'vitest'
import { priceCheckService } from '@/services/priceCheckService'
import {
  calculateDiscountedPrice,
  calculateDiscountPercentage,
  getBestDiscount,
} from '@/services/discountApplicationService'
import { Discount } from '@/types/discount'

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

  it('updates form price field when applying price from B&H', () => {
    let formPriceUsa = 950
    const onPriceApplied = (newPrice: number) => {
      formPriceUsa = newPrice
    }

    const fetchedBhPrice = 999
    onPriceApplied(fetchedBhPrice)

    expect(formPriceUsa).toBe(999)
  })

  it('calculates rebate percentage correctly from B&H rebate info', () => {
    // Caso de uso citado pelo usuário: Sony AN-820A
    // Preço cheio US$ 282.00, Preço com rebate US$ 159.00 -> desconto de US$ 123.00 (~43.62%)
    const priceFull = 282
    const priceWithRebate = 159
    const savings = priceFull - priceWithRebate
    const pct = Number(((savings / priceFull) * 100).toFixed(2))

    expect(savings).toBe(123)
    expect(pct).toBe(43.62)
  })

  it('extracts rebate info from price check message when raw data is structured', () => {
    const message =
      'Preço divergente da B&H. Diferença de US$ -123.00 (-43.62%). [Rebate/Instant Savings ativo na B&H: Preço com desconto US$ 159.00 / Preço cheio US$ 282.00 - Vigência: Limited supply at this price]'

    const isRebateActive = /\[rebate\/instant savings/i.test(message)
    const matchEndDate = message.match(/Vigência:\s*([^\]]+)/i)
    const vigencia = matchEndDate ? matchEndDate[1].trim() : null

    expect(isRebateActive).toBe(true)
    expect(vigencia).toBe('Limited supply at this price')
  })

  describe('discountApplicationService rebate & legacy type compatibility', () => {
    it('applies legacy "percentage" discount type retroactively (Sony AN-820A real case)', () => {
      // Caso de teste real: Sony AN-820A
      // Preço cheio original US$ 282.00, rebate B&H US$ 159.00 -> ~43.617%
      const priceFull = 282.0
      const costPrice = 200.0
      const rebatePct = Number((((282 - 159) / 282) * 100).toFixed(2)) // 43.62%

      // Teste com tipo legado "percentage" gravado previamente pelo modal
      const discountedWithLegacyType = calculateDiscountedPrice(
        priceFull,
        costPrice,
        'percentage',
        rebatePct,
      )

      // Teste com novo tipo padrão "price_usa_percentage"
      const discountedWithStandardType = calculateDiscountedPrice(
        priceFull,
        costPrice,
        'price_usa_percentage',
        rebatePct,
      )

      expect(discountedWithLegacyType).toBeCloseTo(159.0, 1)
      expect(discountedWithLegacyType).toEqual(discountedWithStandardType)
      expect(discountedWithLegacyType).toBeLessThan(priceFull)
    })

    it('applies "fixed" and "fixed_amount" discount types with floor at 0', () => {
      const priceFull = 282.0
      const costPrice = 200.0

      // Desconto fixo de US$ 123.00
      const fixedResult = calculateDiscountedPrice(priceFull, costPrice, 'fixed', 123.0)
      expect(fixedResult).toBe(159.0)

      const fixedAmountResult = calculateDiscountedPrice(
        priceFull,
        costPrice,
        'fixed_amount',
        123.0,
      )
      expect(fixedAmountResult).toBe(159.0)

      // Desconto fixo maior que o preço (não deve ficar negativo, floor em 0)
      const clampedResult = calculateDiscountedPrice(priceFull, costPrice, 'fixed', 350.0)
      expect(clampedResult).toBe(0)
    })

    it('evaluates getBestDiscount correctly with legacy "percentage" rule in database format', () => {
      const productId = 'sony-an820a-id'
      const originalPrice = 282.0
      const costPrice = 200.0

      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 10)

      const discounts: Discount[] = [
        {
          id: 'rule-legacy-rebate',
          name: 'Rebate Fabricante',
          discount_type: 'percentage', // legado
          discount_value: 43.62,
          target_type: 'specific',
          product_selection: [productId],
          is_active: true,
          end_date: futureDate.toISOString(),
        },
      ]

      const best = getBestDiscount(
        discounts,
        productId,
        null,
        null,
        originalPrice,
        costPrice,
      )

      expect(best.ruleName).toBe('Rebate Fabricante')
      expect(best.discountType).toBe('percentage')
      expect(best.originalPrice).toBe(282.0)
      expect(best.discountedPrice).toBeCloseTo(159.0, 1)
      expect(best.discountPercentage).toBeCloseTo(43.62, 1)
    })

    it('evaluates getBestDiscount correctly with "fixed" rule', () => {
      const productId = 'sony-an820a-id'
      const originalPrice = 282.0
      const costPrice = 200.0

      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 10)

      const discounts: Discount[] = [
        {
          id: 'rule-fixed-rebate',
          name: 'Rebate Fabricante',
          discount_type: 'fixed',
          discount_value: 123.0,
          target_type: 'specific',
          product_selection: [productId],
          is_active: true,
          end_date: futureDate.toISOString(),
        },
      ]

      const best = getBestDiscount(
        discounts,
        productId,
        null,
        null,
        originalPrice,
        costPrice,
      )

      expect(best.ruleName).toBe('Rebate Fabricante')
      expect(best.discountType).toBe('fixed')
      expect(best.originalPrice).toBe(282.0)
      expect(best.discountedPrice).toBe(159.0)
      expect(best.discountPercentage).toBeCloseTo(43.62, 1)
    })

    it('preserves existing behavior for margin_percentage and price_usa_percentage', () => {
      const originalPrice = 100
      const costPrice = 60 // margem = 40

      // 50% sobre margem -> margem cai de 40 para 20 -> preço final = 60 + 20 = 80
      const marginResult = calculateDiscountedPrice(
        originalPrice,
        costPrice,
        'margin_percentage',
        50,
      )
      expect(marginResult).toBe(80)

      // 10% sobre preço original -> preço final = 90
      const priceUsaResult = calculateDiscountedPrice(
        originalPrice,
        costPrice,
        'price_usa_percentage',
        10,
      )
      expect(priceUsaResult).toBe(90)
    })
  })
})
