import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  calculateDiscountedPrice,
  calculateDiscountPercentage,
} from '@/services/discountApplicationService'

const CACHE_TTL = 30000
const cache = new Map<string, { data: any; expiry: number }>()
const inflight = new Map<string, Promise<any>>()

async function getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key)
  if (entry && entry.expiry > now) {
    return entry.data as T
  }
  const existing = inflight.get(key)
  if (existing) {
    return existing as Promise<T>
  }
  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, expiry: Date.now() + CACHE_TTL })
      inflight.delete(key)
      return data
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })
  inflight.set(key, promise)
  return promise as Promise<T>
}

async function fetchDiscountsCached() {
  return getCached('discounts:is_active=eq.true', async () => {
    const { data, error } = await supabase.from('discounts').select('*').eq('is_active', true)
    if (error) throw error
    return data
  })
}

async function fetchCustomerRoleCached(userId: string) {
  const cacheKey = `customers:role:user_id=eq.${userId}`
  return getCached(cacheKey, async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('role')
      .eq('user_id', userId)
      .single()
    if (error) throw error
    return data?.role || 'customer'
  })
}

async function fetchPriceSettingsCached() {
  return getCached('price_settings:limit=1', async () => {
    const { data, error } = await supabase
      .from('price_settings')
      .select('exchange_rate, freight_per_kg_usd, weight_margin')
      .single()
    if (error) throw error
    return data
  })
}

async function getUserRole(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData?.session?.user) {
    return fetchCustomerRoleCached(sessionData.session.user.id)
  }
  return 'customer'
}

function isRebateActiveFor(product: any): boolean {
  const now = new Date()
  return (
    typeof product.price_usa_rebate === 'number' &&
    product.price_usa_rebate > 0 &&
    (!product.date_rebate || new Date(product.date_rebate) >= now)
  )
}

function computeBasePriceUsd(product: any, isRebate: boolean): number | null {
  if (isRebate) return product.price_usa_rebate
  return typeof product.price_usd === 'number' && product.price_usd > 0 ? product.price_usd : null
}

function computePriceNat(product: any, isRebate: boolean, priceSettings: any): number | null {
  let priceNat =
    typeof product.price_nationalized_sales === 'number' && product.price_nationalized_sales > 0
      ? product.price_nationalized_sales
      : null

  if (isRebate && priceSettings) {
    const basePriceUsd = product.price_usa_rebate
    const weightKg = (product.weight || 0) * 0.453592
    const freight =
      (weightKg + (priceSettings.weight_margin || 0)) * (priceSettings.freight_per_kg_usd || 120)
    const calcUsd = basePriceUsd + freight
    priceNat = calcUsd * (priceSettings.exchange_rate || 5.0)
  }

  return priceNat
}

function filterValidDiscounts(
  discounts: any[],
  product: any,
  isRebate: boolean,
  userRole: string,
): any[] {
  const now = new Date()
  return (discounts || []).filter((rule) => {
    if (isRebate && userRole === 'customer') return false
    if (isRebate && userRole !== 'vip' && userRole !== 'reseller' && userRole !== 'admin')
      return false

    if (!rule.discount_value || rule.discount_value <= 0) return false
    if (rule.start_date && new Date(rule.start_date) > now) return false
    if (rule.end_date) {
      const endDate = new Date(rule.end_date)
      endDate.setHours(23, 59, 59, 999)
      if (now > endDate) return false
    }
    if (rule.excluded_products && Array.isArray(rule.excluded_products)) {
      if (rule.excluded_products.includes(product.id)) return false
    }
    const targetType = rule.target_type || 'specific'
    if (targetType === 'all') return true
    if (targetType === 'specific')
      return Array.isArray(rule.product_selection) && rule.product_selection.includes(product.id)
    if (targetType === 'manufacturer')
      return (
        Array.isArray(rule.manufacturer_ids) &&
        rule.manufacturer_ids.includes(product.manufacturer_id)
      )
    if (targetType === 'category')
      return Array.isArray(rule.category_ids) && rule.category_ids.includes(product.category_id)
    if (targetType === 'manufacturer_category')
      return (
        Array.isArray(rule.manufacturer_ids) &&
        rule.manufacturer_ids.includes(product.manufacturer_id) &&
        Array.isArray(rule.category_ids) &&
        rule.category_ids.includes(product.category_id)
      )
    if (Array.isArray(rule.product_selection)) return rule.product_selection.includes(product.id)
    return false
  })
}

function computeBestDiscount(
  validDiscounts: any[],
  basePriceUsd: number | null,
  baseCostUsd: number,
  priceNat: number | null,
  costNat: number,
  isRebate: boolean,
  displayOriginalUsd: number | null,
) {
  let bestRuleUsd = null
  let lowestPriceUsd = basePriceUsd !== null ? basePriceUsd : Infinity
  let bestRuleNat = null
  let lowestPriceNat = priceNat !== null ? priceNat : Infinity

  for (const rule of validDiscounts) {
    if (basePriceUsd !== null) {
      const dPrice = calculateDiscountedPrice(
        basePriceUsd,
        baseCostUsd,
        rule.discount_type,
        rule.discount_value,
      )
      if (dPrice < lowestPriceUsd) {
        lowestPriceUsd = dPrice
        bestRuleUsd = rule
      }
    }
    if (priceNat !== null) {
      const dPrice = calculateDiscountedPrice(
        priceNat,
        costNat,
        rule.discount_type,
        rule.discount_value,
      )
      if (dPrice < lowestPriceNat) {
        lowestPriceNat = dPrice
        bestRuleNat = rule
      }
    }
  }

  const hasUsdDiscount = bestRuleUsd && lowestPriceUsd < (basePriceUsd as number)
  const hasNatDiscount = bestRuleNat && lowestPriceNat < (priceNat as number)

  const finalBestRule =
    basePriceUsd !== null
      ? hasUsdDiscount
        ? bestRuleUsd
        : null
      : hasNatDiscount
        ? bestRuleNat
        : null

  let finalDiscountPercentage = 0
  if (isRebate && displayOriginalUsd && basePriceUsd !== null) {
    finalDiscountPercentage = calculateDiscountPercentage(
      displayOriginalUsd,
      hasUsdDiscount ? lowestPriceUsd : basePriceUsd,
    )
  } else {
    finalDiscountPercentage =
      basePriceUsd !== null
        ? hasUsdDiscount
          ? calculateDiscountPercentage(basePriceUsd as number, lowestPriceUsd)
          : 0
        : hasNatDiscount
          ? calculateDiscountPercentage(priceNat as number, lowestPriceNat)
          : 0
  }

  return {
    bestRuleUsd,
    lowestPriceUsd,
    bestRuleNat,
    lowestPriceNat,
    hasUsdDiscount,
    hasNatDiscount,
    finalBestRule,
    finalDiscountPercentage,
  }
}

function buildResult(
  product: any,
  isRebate: boolean,
  basePriceUsd: number | null,
  baseCostUsd: number,
  priceNat: number | null,
  costNat: number,
  userRole: string,
  discounts: any[],
  priceSettings: any,
) {
  const fallbackOriginal = basePriceUsd !== null ? basePriceUsd : priceNat
  const fallbackCurrency = basePriceUsd !== null ? 'USD' : 'BRL'
  const displayOriginalUsd =
    typeof product.price_usd === 'number' && product.price_usd > 0
      ? product.price_usd
      : basePriceUsd

  if (basePriceUsd === null && priceNat === null) {
    return {
      originalPrice: null,
      discountedPrice: null,
      originalPriceNat: null,
      discountedPriceNat: null,
      discountPercentage: 0,
      ruleName: null,
      currency: 'USD',
      isRebateActive: false,
    }
  }

  const validDiscounts = filterValidDiscounts(discounts, product, isRebate, userRole)

  if (validDiscounts.length === 0) {
    return {
      originalPrice: isRebate ? displayOriginalUsd : fallbackOriginal,
      discountedPrice: fallbackOriginal,
      originalPriceNat: priceNat,
      discountedPriceNat: priceNat,
      discountPercentage:
        isRebate && displayOriginalUsd
          ? calculateDiscountPercentage(displayOriginalUsd, fallbackOriginal)
          : 0,
      ruleName: isRebate ? 'REBATE' : null,
      currency: fallbackCurrency,
      isRebateActive: isRebate,
    }
  }

  const bd = computeBestDiscount(
    validDiscounts,
    basePriceUsd,
    baseCostUsd,
    priceNat,
    costNat,
    isRebate,
    displayOriginalUsd,
  )

  return {
    originalPrice: isRebate ? displayOriginalUsd : fallbackOriginal,
    discountedPrice:
      basePriceUsd !== null
        ? bd.hasUsdDiscount
          ? bd.lowestPriceUsd
          : basePriceUsd
        : bd.hasNatDiscount
          ? bd.lowestPriceNat
          : priceNat,
    originalPriceNat: priceNat,
    discountedPriceNat: bd.hasNatDiscount ? bd.lowestPriceNat : priceNat,
    discountPercentage: bd.finalDiscountPercentage,
    ruleName: bd.finalBestRule ? bd.finalBestRule.name : isRebate ? 'REBATE' : null,
    currency: fallbackCurrency,
    isRebateActive: isRebate,
  }
}

export function useMultipleProductDiscounts(products: any[]) {
  const [discountsMap, setDiscountsMap] = useState<Record<string, any>>({})

  const productsHash = products
    .map((p) => `${p?.id}-${p?.price_usd}-${p?.price_nationalized_sales}-${p?.price_usa_rebate}`)
    .join('|')

  useEffect(() => {
    if (!products || products.length === 0) {
      setDiscountsMap({})
      return
    }

    const fetchAll = async () => {
      try {
        const [discounts, userRole, priceSettings] = await Promise.all([
          fetchDiscountsCached(),
          getUserRole(),
          fetchPriceSettingsCached(),
        ])

        const newMap: Record<string, any> = {}

        products.forEach((product) => {
          if (!product?.id) return

          const isRebate = isRebateActiveFor(product)
          const basePriceUsd = computeBasePriceUsd(product, isRebate)
          const baseCostUsd = isRebate ? product.price_cost_rebate || 0 : product.price_cost || 0
          const priceNat = computePriceNat(product, isRebate, priceSettings)
          const costNat = product.price_nationalized_cost || 0

          newMap[product.id] = buildResult(
            product,
            isRebate,
            basePriceUsd,
            baseCostUsd,
            priceNat,
            costNat,
            userRole,
            discounts,
            priceSettings,
          )
        })

        setDiscountsMap(newMap)
      } catch (err) {
        console.error('Error fetching discounts:', err)
      }
    }

    fetchAll()
  }, [productsHash])

  return discountsMap
}

export function useProductDiscount(product: any) {
  const [discountedPrice, setDiscountedPrice] = useState<number | null>(null)
  const [originalPrice, setOriginalPrice] = useState<number | null>(null)
  const [discountedPriceNat, setDiscountedPriceNat] = useState<number | null>(null)
  const [originalPriceNat, setOriginalPriceNat] = useState<number | null>(null)
  const [discountPercentage, setDiscountPercentage] = useState<number>(0)
  const [ruleName, setRuleName] = useState<string | null>(null)
  const [currency, setCurrency] = useState<'USD' | 'BRL'>('USD')
  const [isRebateActive, setIsRebateActive] = useState<boolean>(false)

  useEffect(() => {
    if (!product) return

    const fetchDiscounts = async () => {
      try {
        const isRebate = isRebateActiveFor(product)
        setIsRebateActive(isRebate)

        const basePriceUsd = computeBasePriceUsd(product, isRebate)
        const baseCostUsd = isRebate ? product.price_cost_rebate || 0 : product.price_cost || 0

        const [priceSettings, userRole, discounts] = await Promise.all([
          fetchPriceSettingsCached(),
          getUserRole(),
          fetchDiscountsCached(),
        ])

        const priceNat = computePriceNat(product, isRebate, priceSettings)
        const costNat = product.price_nationalized_cost || 0

        const fallbackOriginal = basePriceUsd !== null ? basePriceUsd : priceNat
        const fallbackCurrency = basePriceUsd !== null ? 'USD' : 'BRL'
        const displayOriginalUsd =
          typeof product.price_usd === 'number' && product.price_usd > 0
            ? product.price_usd
            : basePriceUsd

        setOriginalPrice(isRebate ? displayOriginalUsd : fallbackOriginal)
        setOriginalPriceNat(priceNat)
        setCurrency(fallbackCurrency)

        if (basePriceUsd === null && priceNat === null) {
          setDiscountedPrice(null)
          setDiscountedPriceNat(null)
          return
        }

        const result = buildResult(
          product,
          isRebate,
          basePriceUsd,
          baseCostUsd,
          priceNat,
          costNat,
          userRole,
          discounts,
          priceSettings,
        )

        setDiscountedPrice(result.discountedPrice)
        setDiscountedPriceNat(result.discountedPriceNat)
        setDiscountPercentage(result.discountPercentage)
        setRuleName(result.ruleName)
      } catch (err) {
        console.error('Error fetching discounts:', err)
      }
    }

    fetchDiscounts()
  }, [
    product?.id,
    product?.price_usd,
    product?.price_cost,
    product?.price_nationalized_sales,
    product?.price_usa_rebate,
  ])

  return {
    originalPrice,
    discountedPrice,
    originalPriceNat,
    discountedPriceNat,
    discountPercentage,
    ruleName,
    currency,
    isRebateActive,
  }
}
