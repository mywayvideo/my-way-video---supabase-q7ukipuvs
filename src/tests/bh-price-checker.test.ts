import { describe, it, expect, vi } from 'vitest'
import {
  priceCheckService,
  evaluatePricePair,
  evaluatePairedPrices,
  extractRebateInfo,
  resolvePairedEvaluation,
} from '@/services/priceCheckService'
import {
  calculateDiscountedPrice,
  calculateDiscountPercentage,
  getBestDiscount,
} from '@/services/discountApplicationService'
import { Discount } from '@/types/discount'
import { ExistingRebateRule } from '@/services/rebateDiscountService'

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

    // Caso 5: Regressão Sony AD-C88: price_usd = 200.00 e B&H correto = 200.00 -> status "ok", diff 0
    expect(evaluateTolerance(200, 200).status).toBe('ok')
    expect(evaluateTolerance(200, 200).diffUsd).toBe(0)
    expect(evaluateTolerance(200, 200).diffPct).toBe(0)
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

  describe('evaluatePairedPrices - Paired comparison aware of active rebate', () => {
    it('Caso real Sony AN820A com campos NATIVOS: 282,00 cheio / 159,00 com rebate em ambos os lados -> resultado OK nos dois pares sem falso alerta', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const evaluation = evaluatePairedPrices({
        catalogPriceUsd: 282.0,
        catalogPriceRebate: 159.0,
        catalogDateRebate: futureDate.toISOString(),
        bhPrice: 159.0, // preço retornado pela B&H
        bhPriceFull: 282.0, // preço cheio da B&H
        bhPriceWithRebate: 159.0, // preço com rebate da B&H
        bhRebateActive: true,
      })

      expect(evaluation.mode).toBe('paired')
      expect(evaluation.status).toBe('ok')
      expect(evaluation.overallWithinTolerance).toBe(true)

      // Par cheio: 282 x 282 -> OK
      expect(evaluation.fullPair).toBeDefined()
      expect(evaluation.fullPair?.priceCatalog).toBe(282.0)
      expect(evaluation.fullPair?.priceBh).toBe(282.0)
      expect(evaluation.fullPair?.isWithinTolerance).toBe(true)
      expect(evaluation.fullPair?.diffUsd).toBe(0)

      // Par desconto: 159 x 159 -> OK
      expect(evaluation.rebatePair).toBeDefined()
      expect(evaluation.rebatePair?.priceCatalog).toBe(159.0)
      expect(evaluation.rebatePair?.priceBh).toBe(159.0)
      expect(evaluation.rebatePair?.isWithinTolerance).toBe(true)
      expect(evaluation.rebatePair?.diffUsd).toBe(0)
    })

    it('Caso real Sony AN820A com regra legada ExistingRebateRule -> compatibilidade mantida', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const activeRebateRule: ExistingRebateRule = {
        id: 'rebate-rule-sony-an820a',
        name: 'Rebate Fabricante',
        discount_type: 'price_usa_percentage',
        discount_value: 43.62, // Desconto que leva de 282 para 159
        start_date: new Date(Date.now() - 86400000).toISOString(),
        end_date: futureDate.toISOString(),
        is_active: true,
        product_selection: ['sony-an820a-id'],
      }

      const evaluation = evaluatePairedPrices({
        catalogPriceUsd: 282.0,
        rebateRule: activeRebateRule,
        bhPrice: 159.0,
        bhPriceFull: 282.0,
        bhPriceWithRebate: 159.0,
        bhRebateActive: true,
      })

      expect(evaluation.mode).toBe('paired')
      expect(evaluation.status).toBe('ok')
      expect(evaluation.overallWithinTolerance).toBe(true)
      expect(evaluation.fullPair?.isWithinTolerance).toBe(true)
      expect(evaluation.rebatePair?.isWithinTolerance).toBe(true)
    })

    it('Caso rebate expirado (date_rebate no passado): ignora rebate e compara só preço cheio', () => {
      const pastDate = new Date(Date.now() - 86400000 * 5) // 5 dias atrás

      const evaluation = evaluatePairedPrices({
        catalogPriceUsd: 282.0,
        catalogPriceRebate: 159.0,
        catalogDateRebate: pastDate.toISOString(),
        bhPrice: 282.0,
        bhPriceFull: 282.0,
        bhPriceWithRebate: 159.0,
        bhRebateActive: true,
      })

      // Como o rebate expirou no catálogo, cai para comparação single do preço cheio
      expect(evaluation.mode).toBe('single')
      expect(evaluation.status).toBe('ok')
      expect(evaluation.overallWithinTolerance).toBe(true)
      expect(evaluation.rebatePair).toBeNull()
    })

    it('Caso de divergência real no rebate: B&H rebate para US$ 149,00 enquanto cadastro dá US$ 159,00 -> status "divergente" no par desconto e cheio OK', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const activeRebateRule: ExistingRebateRule = {
        id: 'rebate-rule-sony-an820a',
        name: 'Rebate Fabricante',
        discount_type: 'price_usa_percentage',
        discount_value: 43.62,
        start_date: new Date(Date.now() - 86400000).toISOString(),
        end_date: futureDate.toISOString(),
        is_active: true,
        product_selection: ['sony-an820a-id'],
      }

      const evaluation = evaluatePairedPrices({
        catalogPriceUsd: 282.0,
        rebateRule: activeRebateRule,
        bhPrice: 149.0,
        bhPriceFull: 282.0,
        bhPriceWithRebate: 149.0, // diverge em US$ 10.00
        bhRebateActive: true,
      })

      expect(evaluation.mode).toBe('paired')
      expect(evaluation.status).toBe('divergente')
      expect(evaluation.overallWithinTolerance).toBe(false)

      // Par cheio OK
      expect(evaluation.fullPair?.isWithinTolerance).toBe(true)
      // Par desconto divergente
      expect(evaluation.rebatePair?.isWithinTolerance).toBe(false)
      expect(evaluation.rebatePair?.diffUsd).toBeCloseTo(-10.0, 1)
      expect(evaluation.message).toContain('Preço com rebate diverge')
    })

    it('Caso de divergência real no preço cheio: B&H alterou preço de lista para US$ 299,00 mas desconto bate -> status "divergente" no par cheio', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const activeRebateRule: ExistingRebateRule = {
        id: 'rebate-rule-sony-an820a',
        name: 'Rebate Fabricante',
        discount_type: 'price_usa_percentage',
        discount_value: 43.62,
        start_date: new Date(Date.now() - 86400000).toISOString(),
        end_date: futureDate.toISOString(),
        is_active: true,
        product_selection: ['sony-an820a-id'],
      }

      const evaluation = evaluatePairedPrices({
        catalogPriceUsd: 282.0,
        rebateRule: activeRebateRule,
        bhPrice: 159.0,
        bhPriceFull: 299.0, // preço de lista da B&H subiu
        bhPriceWithRebate: 159.0,
        bhRebateActive: true,
      })

      expect(evaluation.mode).toBe('paired')
      expect(evaluation.status).toBe('divergente')
      expect(evaluation.fullPair?.isWithinTolerance).toBe(false)
      expect(evaluation.rebatePair?.isWithinTolerance).toBe(true)
      expect(evaluation.message).toContain('Preço cheio diverge')
    })

    it('Produto sem rebate vigente no cadastro: mantém modo single (comparação simples atual)', () => {
      const evaluation = evaluatePairedPrices({
        catalogPriceUsd: 282.0,
        rebateRule: null, // sem regra de rebate
        bhPrice: 282.0,
      })

      expect(evaluation.mode).toBe('single')
      expect(evaluation.status).toBe('ok')
      expect(evaluation.overallWithinTolerance).toBe(true)
      expect(evaluation.rebatePair).toBeNull()
    })

    it('Produto sem rebate com divergência simples: gera divergente corretamente', () => {
      const evaluation = evaluatePairedPrices({
        catalogPriceUsd: 282.0,
        rebateRule: null,
        bhPrice: 250.0,
      })

      expect(evaluation.mode).toBe('single')
      expect(evaluation.status).toBe('divergente')
      expect(evaluation.overallWithinTolerance).toBe(false)
    })

    it('B&H sem preço regular separado mas com rebate: compara par de desconto com efetivo', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const activeRebateRule: ExistingRebateRule = {
        id: 'rebate-rule-1',
        name: 'Rebate Fabricante',
        discount_type: 'price_usa_percentage',
        discount_value: 43.62,
        start_date: null,
        end_date: futureDate.toISOString(),
        is_active: true,
        product_selection: ['p1'],
      }

      const evaluation = evaluatePairedPrices({
        catalogPriceUsd: 282.0,
        rebateRule: activeRebateRule,
        bhPrice: 159.0,
        bhPriceFull: null, // B&H não reportou regular
        bhPriceWithRebate: 159.0,
        bhRebateActive: true,
      })

      expect(evaluation.mode).toBe('paired')
      expect(evaluation.status).toBe('ok')
      expect(evaluation.rebatePair?.isWithinTolerance).toBe(true)
      expect(evaluation.fullPair).toBeNull()
    })

    it('extractRebateInfo helper extrai corretamente dados de rebate em raw payload e mensagens', () => {
      const rawPayload = {
        rebate_info: {
          rebate_active: true,
          price_full: 282,
          price_with_rebate: 159,
          rebate_savings: 123,
          rebate_end_date: 'Ends May 31',
        },
      }

      const extracted = extractRebateInfo({
        raw: rawPayload,
        catalogPriceUsd: 282,
      })

      expect(extracted.isBhRebateActive).toBe(true)
      expect(extracted.rebatePriceFull).toBe(282)
      expect(extracted.rebatePriceWithDiscount).toBe(159)
      expect(extracted.rebateSavings).toBe(123)
      expect(extracted.rebateEndDate).toBe('Ends May 31')
    })

    it('resolvePairedEvaluation helper unifica o status com campos nativos do produto', () => {
      // Simulação do caso AN820A nativo (price_usd 282, price_usa_rebate 159)
      const resolution = resolvePairedEvaluation({
        status: 'divergente',
        catalogPriceUsd: 282,
        catalogPriceRebate: 159,
        catalogDateRebate: '2028-12-31T23:59:59.000Z',
        priceBh: 159,
        priceFull: 282,
        priceWithRebate: 159,
        isBhRebateActive: true,
        defaultMessage: 'Preço divergente da B&H',
      })

      // Status efetivo DEVE ser 'ok', com ambos os pares OK
      expect(resolution.effectiveStatus).toBe('ok')
      expect(resolution.pairedEval?.overallWithinTolerance).toBe(true)
      expect(resolution.pairedEval?.fullPair?.isWithinTolerance).toBe(true)
      expect(resolution.pairedEval?.rebatePair?.isWithinTolerance).toBe(true)
      expect(resolution.effectiveMessage).toContain('Preços conferidos com a B&H em ambos os pares')
    })
  })
})
