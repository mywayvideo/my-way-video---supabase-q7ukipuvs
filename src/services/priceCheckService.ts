import { supabase } from '@/lib/supabase/client'
import { rebateDiscountService, ExistingRebateRule } from '@/services/rebateDiscountService'
import { calculateDiscountedPrice } from '@/services/discountApplicationService'

export type PriceCheckStatus = 'ok' | 'divergente' | 'descontinuado' | 'sem_url_confirmada' | 'erro'

export interface PricePairComparison {
  label: string
  priceCatalog: number | null
  priceBh: number | null
  diffUsd: number | null
  diffPct: number | null
  isWithinTolerance: boolean
}

export interface PairedCheckEvaluation {
  status: PriceCheckStatus
  mode: 'single' | 'paired'
  fullPair?: PricePairComparison | null
  rebatePair?: PricePairComparison | null
  overallWithinTolerance: boolean
  message: string
  rebateRuleFound?: boolean
  catalogEffectivePrice?: number | null
}

export interface PriceCheckResult {
  status: PriceCheckStatus
  price_usd_cadastrado?: number | null
  price_bh?: number | null
  diff_usd?: number | null
  diff_pct?: number | null
  is_discontinued?: boolean
  url_used?: string | null
  url_discovered?: boolean
  message?: string
  checked_at?: string
  error?: string
  rebate_active?: boolean
  price_full?: number | null
  price_with_rebate?: number | null
  rebate_savings?: number | null
  rebate_end_date?: string | null
  rebate_end_date_iso?: string | null
  sku_matched?: boolean
  mfr_number_found?: string | null
  evaluation?: PairedCheckEvaluation | null
}

/**
 * Normaliza os dados de rebate para uso compartilhado tanto do resultado em tempo real
 * quanto do histórico (raw.rebate_info) ou mensagens de verificação.
 */
export function extractRebateInfo(params: {
  checkResult?: PriceCheckResult | null
  raw?: any
  message?: string | null
  catalogPriceUsd?: number | null
}): {
  isBhRebateActive: boolean
  rebatePriceFull: number | null
  rebatePriceWithDiscount: number | null
  rebateSavings: number | null
  rebateEndDate: string | null
  rebateEndDateIso: string | null
} {
  const { checkResult, raw, message, catalogPriceUsd } = params
  const rawRebate = raw?.rebate_info || raw

  const displayMessage = checkResult?.message || message || ''
  const isBhRebateActive = Boolean(
    checkResult?.rebate_active ??
    rawRebate?.rebate_active ??
    (displayMessage && /\[rebate\/instant savings/i.test(displayMessage)),
  )

  const rebatePriceFull =
    checkResult?.price_full ??
    rawRebate?.price_full ??
    (catalogPriceUsd != null ? catalogPriceUsd : null)

  const rebatePriceWithDiscount =
    checkResult?.price_with_rebate ?? rawRebate?.price_with_rebate ?? checkResult?.price_bh ?? null

  const rebateSavings =
    checkResult?.rebate_savings ??
    rawRebate?.rebate_savings ??
    (rebatePriceFull != null &&
    rebatePriceWithDiscount != null &&
    rebatePriceFull > rebatePriceWithDiscount
      ? Number((rebatePriceFull - rebatePriceWithDiscount).toFixed(2))
      : null)

  const rebateEndDate =
    checkResult?.rebate_end_date ??
    rawRebate?.rebate_end_date ??
    (() => {
      const match = displayMessage?.match(/Vigência:\s*([^\]]+)/i)
      return match ? match[1].trim() : null
    })()

  const rebateEndDateIso =
    checkResult?.rebate_end_date_iso ?? rawRebate?.rebate_end_date_iso ?? null

  return {
    isBhRebateActive,
    rebatePriceFull,
    rebatePriceWithDiscount,
    rebateSavings,
    rebateEndDate,
    rebateEndDateIso,
  }
}

/**
 * Avalia o resultado de verificação com consciência de pareamento (Rebate Fabricante ativo),
 * retornando o status efetivo, mensagem efetiva e a avaliação estruturada PairedCheckEvaluation.
 */
export function resolvePairedEvaluation(params: {
  status?: PriceCheckStatus | null
  catalogPriceUsd?: number | null
  rebateRule?: ExistingRebateRule | null
  priceBh?: number | null
  priceFull?: number | null
  priceWithRebate?: number | null
  isBhRebateActive?: boolean | null
  defaultMessage?: string | null
}): {
  effectiveStatus: PriceCheckStatus
  effectiveMessage: string | null
  pairedEval: PairedCheckEvaluation | null
} {
  const {
    status,
    catalogPriceUsd,
    rebateRule,
    priceBh,
    priceFull,
    priceWithRebate,
    isBhRebateActive,
    defaultMessage,
  } = params

  const baseStatus: PriceCheckStatus = status || 'ok'

  // Casos terminais ou de erro não sofrem pareamento
  if (
    baseStatus === 'descontinuado' ||
    baseStatus === 'sem_url_confirmada' ||
    baseStatus === 'erro'
  ) {
    return {
      effectiveStatus: baseStatus,
      effectiveMessage: defaultMessage || null,
      pairedEval: null,
    }
  }

  // Executa avaliação pareada (se houver rebate ativo no cadastro e na B&H, compara pareado; senão simples)
  const pairedEval = evaluatePairedPrices({
    catalogPriceUsd,
    rebateRule,
    bhPrice: priceBh,
    bhPriceFull: priceFull,
    bhPriceWithRebate: priceWithRebate,
    bhRebateActive: isBhRebateActive,
  })

  return {
    effectiveStatus: pairedEval.status,
    effectiveMessage: pairedEval.message || defaultMessage || null,
    pairedEval,
  }
}

/**
 * Avalia se a diferença entre dois preços em USD está dentro da tolerância
 * (1% ou US$ 1.00, o que for MAIOR)
 */
export function evaluatePricePair(
  label: string,
  priceCatalog: number | null | undefined,
  priceBh: number | null | undefined,
): PricePairComparison {
  if (priceCatalog == null || priceBh == null) {
    return {
      label,
      priceCatalog: priceCatalog ?? null,
      priceBh: priceBh ?? null,
      diffUsd: null,
      diffPct: null,
      isWithinTolerance: false,
    }
  }

  const diffUsd = Number((priceBh - priceCatalog).toFixed(2))
  const absDiffUsd = Math.abs(diffUsd)
  const diffPct =
    priceCatalog > 0 ? Number((((priceBh - priceCatalog) / priceCatalog) * 100).toFixed(2)) : null
  const absDiffPct = diffPct != null ? Math.abs(diffPct) : 100

  // Tolerância: 1% ou US$ 1.00, o que for maior
  const toleranceUsd = Math.max(1.0, priceCatalog * 0.01)
  const isWithinTolerance = absDiffUsd <= toleranceUsd || absDiffPct <= 1.0

  return {
    label,
    priceCatalog,
    priceBh,
    diffUsd,
    diffPct,
    isWithinTolerance,
  }
}

/**
 * Avalia comparação de preços com consciência de desconto vigente.
 * Quando houver rebate/desconto ativo no cadastro E na B&H, compara pareado:
 * - Par cheio: price_usd × price_full (B&H regular)
 * - Par desconto: preço efetivo do cadastro (com desconto aplicado) × price_with_rebate (B&H com rebate)
 * Caso contrário, mantém a comparação simples atual.
 */
export function evaluatePairedPrices(params: {
  catalogPriceUsd: number | null | undefined
  rebateRule: ExistingRebateRule | null | undefined
  bhPrice: number | null | undefined
  bhPriceFull?: number | null | undefined
  bhPriceWithRebate?: number | null | undefined
  bhRebateActive?: boolean | null
}): PairedCheckEvaluation {
  const { catalogPriceUsd, rebateRule, bhPrice, bhPriceFull, bhPriceWithRebate, bhRebateActive } =
    params

  const priceDb = catalogPriceUsd != null && catalogPriceUsd > 0 ? catalogPriceUsd : null

  // Verifica se a regra de rebate está vigente
  let isCatalogRebateActive = false
  let catalogEffectivePrice: number | null = null

  if (rebateRule && rebateRule.is_active !== false && priceDb != null) {
    const now = new Date()
    const isStarted = !rebateRule.start_date || new Date(rebateRule.start_date) <= now
    const isNotExpired = !rebateRule.end_date || new Date(rebateRule.end_date) >= now
    if (isStarted && isNotExpired && rebateRule.discount_value > 0) {
      isCatalogRebateActive = true
      catalogEffectivePrice = Number(
        calculateDiscountedPrice(
          priceDb,
          0,
          rebateRule.discount_type,
          rebateRule.discount_value,
        ).toFixed(2),
      )
    }
  }

  const isBhRebate = Boolean(
    bhRebateActive ||
    (bhPriceWithRebate != null && bhPriceFull != null && bhPriceFull > bhPriceWithRebate),
  )

  // CENÁRIO PAREADO: rebate no cadastro E rebate na B&H
  if (isCatalogRebateActive && catalogEffectivePrice != null && isBhRebate) {
    const bhEffectiveRebatePrice = bhPriceWithRebate ?? bhPrice ?? null
    // Se a B&H tem price_full explícito (preço regular cheio)
    const bhEffectiveFullPrice =
      bhPriceFull != null && bhPriceFull > (bhEffectiveRebatePrice ?? 0) ? bhPriceFull : null

    let fullPair: PricePairComparison | null = null
    if (bhEffectiveFullPrice != null && priceDb != null) {
      fullPair = evaluatePricePair('Preço Cheio', priceDb, bhEffectiveFullPrice)
    }

    const rebatePair = evaluatePricePair(
      'Com Rebate',
      catalogEffectivePrice,
      bhEffectiveRebatePrice,
    )

    // Se temos os dois pares, ambos devem estar dentro da tolerância
    // Se a B&H não reportou preço cheio separado, avaliamos o par com desconto
    const overallWithinTolerance =
      fullPair != null
        ? fullPair.isWithinTolerance && rebatePair.isWithinTolerance
        : rebatePair.isWithinTolerance

    const status: PriceCheckStatus = overallWithinTolerance ? 'ok' : 'divergente'

    let message = ''
    if (overallWithinTolerance) {
      if (fullPair) {
        message = `Preços conferidos com a B&H em ambos os pares: Cheio (US$ ${priceDb?.toFixed(2)} × US$ ${bhEffectiveFullPrice?.toFixed(2)}) e Rebate (US$ ${catalogEffectivePrice.toFixed(2)} × US$ ${bhEffectiveRebatePrice?.toFixed(2)}).`
      } else {
        message = `Preço com rebate conferido com a B&H: US$ ${catalogEffectivePrice.toFixed(2)} × US$ ${bhEffectiveRebatePrice?.toFixed(2)} dentro da tolerância.`
      }
    } else {
      const divergentParts: string[] = []
      if (fullPair && !fullPair.isWithinTolerance) {
        divergentParts.push(
          `Preço cheio diverge: Cadastrado US$ ${priceDb?.toFixed(2)} × B&H regular US$ ${bhEffectiveFullPrice?.toFixed(2)} (dif: ${fullPair.diffUsd! > 0 ? '+' : ''}${fullPair.diffUsd?.toFixed(2)})`,
        )
      }
      if (!rebatePair.isWithinTolerance) {
        divergentParts.push(
          `Preço com rebate diverge: Cadastrado US$ ${catalogEffectivePrice.toFixed(2)} × B&H rebate US$ ${bhEffectiveRebatePrice?.toFixed(2)} (dif: ${rebatePair.diffUsd! > 0 ? '+' : ''}${rebatePair.diffUsd?.toFixed(2)})`,
        )
      }
      message = divergentParts.join(' · ')
    }

    return {
      status,
      mode: 'paired',
      fullPair,
      rebatePair,
      overallWithinTolerance,
      message,
      rebateRuleFound: true,
      catalogEffectivePrice,
    }
  }

  // CENÁRIO NÃO PAREADO (padrão atual: comparação simples)
  // Se não houver rebate vigente no cadastro, mas houver preço da B&H
  const singlePair = evaluatePricePair('Preço', priceDb, bhPrice)
  const status: PriceCheckStatus = singlePair.isWithinTolerance ? 'ok' : 'divergente'

  const message = singlePair.isWithinTolerance
    ? `Preço conferido com a B&H. Variação de US$ ${singlePair.diffUsd?.toFixed(2)} dentro da tolerância acordada.`
    : `Preço divergente da B&H. Diferença de US$ ${singlePair.diffUsd != null && singlePair.diffUsd > 0 ? '+' : ''}${singlePair.diffUsd?.toFixed(2)} (${singlePair.diffPct != null && singlePair.diffPct > 0 ? '+' : ''}${singlePair.diffPct?.toFixed(2)}%).`

  return {
    status,
    mode: 'single',
    fullPair: singlePair,
    rebatePair: null,
    overallWithinTolerance: singlePair.isWithinTolerance,
    message,
    rebateRuleFound: isCatalogRebateActive,
    catalogEffectivePrice,
  }
}

export interface PriceCheckRecord {
  id: string
  product_id: string
  checked_at: string
  price_db: number | null
  price_bh: number | null
  diff_usd: number | null
  diff_pct: number | null
  status: PriceCheckStatus
  source: 'manual' | 'batch'
  url_used: string | null
  url_discovered: boolean
  message: string | null
  raw?: any
}

export const priceCheckService = {
  /**
   * Dispara a verificação unitária em tempo real na B&H via edge function check-price-bhphoto
   */
  async checkBhPrice(
    productId: string,
    source: 'manual' | 'batch' = 'manual',
    manualUrl?: string,
  ): Promise<PriceCheckResult> {
    const { data, error } = await supabase.functions.invoke('check-price-bhphoto', {
      body: {
        product_id: productId,
        source,
        ...(manualUrl ? { manual_url: manualUrl } : {}),
      },
    })

    if (error) {
      throw new Error(error.message || 'Falha ao conectar com o serviço de verificação da B&H.')
    }

    if (!data) {
      throw new Error('Nenhuma resposta retornada pelo serviço de verificação.')
    }

    return {
      status: data.status || (data.error ? 'erro' : 'ok'),
      price_usd_cadastrado: data.price_usd_cadastrado,
      price_bh: data.price_bh,
      diff_usd: data.diff_usd,
      diff_pct: data.diff_pct,
      is_discontinued: data.is_discontinued,
      url_used: data.url_used,
      url_discovered: data.url_discovered,
      message: data.message || data.error,
      checked_at: new Date().toISOString(),
      error: data.error,
      rebate_active: Boolean(data.rebate_active),
      price_full: data.price_full ?? null,
      price_with_rebate: data.price_with_rebate ?? null,
      rebate_savings: data.rebate_savings ?? null,
      rebate_end_date: data.rebate_end_date ?? null,
      rebate_end_date_iso: data.rebate_end_date_iso ?? null,
      sku_matched: data.sku_matched !== undefined ? Boolean(data.sku_matched) : true,
      mfr_number_found: data.mfr_number_found ?? null,
    }
  },

  /**
   * Busca a última verificação registrada para o produto
   */
  async getLatestCheck(productId: string): Promise<PriceCheckRecord | null> {
    const { data, error } = await supabase
      .from('price_checks' as any)
      .select('*')
      .eq('product_id', productId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('Erro ao buscar última verificação de preço:', error)
      return null
    }

    return (data as unknown as PriceCheckRecord) || null
  },

  /**
   * Aplica o preço B&H ao produto:
   * Atualiza price_usd no cadastro de produtos.
   * O banco de dados recalcula automaticamente price_brl via trigger trg_calculate_product_price_brl.
   */
  async applyBhPrice(productId: string, newPriceUsd: number): Promise<void> {
    if (!newPriceUsd || newPriceUsd <= 0) {
      throw new Error('Preço B&H inválido para aplicação.')
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({
        price_usd: newPriceUsd,
        updated_at: now,
        last_reviewed_at: now,
      } as any)
      .eq('id', productId)

    if (error) {
      throw new Error(error.message || 'Erro ao atualizar o preço do produto.')
    }
  },

  /**
   * Salva uma URL manual da B&H em products.website_url
   * Atualiza updated_at e last_reviewed_at de acordo com as regras de auditoria
   */
  async updateWebsiteUrl(productId: string, websiteUrl: string): Promise<void> {
    const cleanUrl = websiteUrl.trim()
    if (!cleanUrl || !cleanUrl.startsWith('http')) {
      throw new Error('URL da B&H inválida. Deve começar com http:// ou https://')
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('products')
      .update({
        website_url: cleanUrl,
        updated_at: now,
        last_reviewed_at: now,
      } as any)
      .eq('id', productId)

    if (error) {
      throw new Error(error.message || 'Erro ao atualizar a URL do produto.')
    }
  },
}
