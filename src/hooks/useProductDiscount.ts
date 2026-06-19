import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  calculateDiscountedPrice,
  calculateDiscountPercentage,
} from '@/services/discountApplicationService'

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

    const fetchDiscounts = async () => {
      try {
        const { data: discounts } = await supabase
          .from('discounts')
          .select('*')
          .eq('is_active', true)

        const { data: sessionData } = await supabase.auth.getSession()
        let userRole = 'customer'
        if (sessionData?.session?.user) {
          const { data: customer } = await supabase
            .from('customers')
            .select('role')
            .eq('user_id', sessionData.session.user.id)
            .single()
          if (customer) userRole = customer.role
        }

        const { data: priceSettings } = await supabase
          .from('price_settings')
          .select('exchange_rate, freight_per_kg_usd, weight_margin')
          .single()

        const newMap: Record<string, any> = {}
        const now = new Date()

        products.forEach((product) => {
          if (!product?.id) return

          const isRebateActive =
            typeof product.price_usa_rebate === 'number' &&
            product.price_usa_rebate > 0 &&
            (!product.date_rebate || new Date(product.date_rebate) >= now)

          const basePriceUsd = isRebateActive
            ? product.price_usa_rebate
            : typeof product.price_usd === 'number' && product.price_usd > 0
              ? product.price_usd
              : null
          const baseCostUsd = isRebateActive
            ? product.price_cost_rebate || 0
            : product.price_cost || 0

          let priceNat =
            typeof product.price_nationalized_sales === 'number' &&
            product.price_nationalized_sales > 0
              ? product.price_nationalized_sales
              : null
          const costNat = product.price_nationalized_cost || 0

          if (isRebateActive && priceSettings) {
            const weightKg = (product.weight || 0) * 0.453592
            const freight =
              (weightKg + (priceSettings.weight_margin || 0)) *
              (priceSettings.freight_per_kg_usd || 120)
            const calcUsd = basePriceUsd + freight
            priceNat = calcUsd * (priceSettings.exchange_rate || 5.0)
          }

          const fallbackOriginal = basePriceUsd !== null ? basePriceUsd : priceNat
          const fallbackCurrency = basePriceUsd !== null ? 'USD' : 'BRL'
          const displayOriginalUsd =
            typeof product.price_usd === 'number' && product.price_usd > 0
              ? product.price_usd
              : basePriceUsd

          if (basePriceUsd === null && priceNat === null) {
            newMap[product.id] = {
              originalPrice: null,
              discountedPrice: null,
              originalPriceNat: null,
              discountedPriceNat: null,
              discountPercentage: 0,
              ruleName: null,
              currency: 'USD',
              isRebateActive: false,
            }
            return
          }

          const validDiscounts = (discounts || []).filter((rule) => {
            if (isRebateActive && userRole === 'customer') return false
            if (
              isRebateActive &&
              userRole !== 'vip' &&
              userRole !== 'reseller' &&
              userRole !== 'admin'
            )
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
              return (
                Array.isArray(rule.product_selection) && rule.product_selection.includes(product.id)
              )
            if (targetType === 'manufacturer')
              return (
                Array.isArray(rule.manufacturer_ids) &&
                rule.manufacturer_ids.includes(product.manufacturer_id)
              )
            if (targetType === 'category')
              return (
                Array.isArray(rule.category_ids) && rule.category_ids.includes(product.category_id)
              )
            if (targetType === 'manufacturer_category')
              return (
                Array.isArray(rule.manufacturer_ids) &&
                rule.manufacturer_ids.includes(product.manufacturer_id) &&
                Array.isArray(rule.category_ids) &&
                rule.category_ids.includes(product.category_id)
              )
            if (Array.isArray(rule.product_selection))
              return rule.product_selection.includes(product.id)
            return false
          })

          if (validDiscounts.length === 0) {
            newMap[product.id] = {
              originalPrice: isRebateActive ? displayOriginalUsd : fallbackOriginal,
              discountedPrice: fallbackOriginal,
              originalPriceNat: priceNat,
              discountedPriceNat: priceNat,
              discountPercentage:
                isRebateActive && displayOriginalUsd
                  ? calculateDiscountPercentage(displayOriginalUsd, fallbackOriginal)
                  : 0,
              ruleName: isRebateActive ? 'REBATE' : null,
              currency: fallbackCurrency,
              isRebateActive,
            }
            return
          }

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
          if (isRebateActive && displayOriginalUsd && basePriceUsd !== null) {
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

          newMap[product.id] = {
            originalPrice: isRebateActive ? displayOriginalUsd : fallbackOriginal,
            discountedPrice:
              basePriceUsd !== null
                ? hasUsdDiscount
                  ? lowestPriceUsd
                  : basePriceUsd
                : hasNatDiscount
                  ? lowestPriceNat
                  : priceNat,
            originalPriceNat: priceNat,
            discountedPriceNat: hasNatDiscount ? lowestPriceNat : priceNat,
            discountPercentage: finalDiscountPercentage,
            ruleName: finalBestRule ? finalBestRule.name : isRebateActive ? 'REBATE' : null,
            currency: fallbackCurrency,
            isRebateActive,
          }
        })

        setDiscountsMap(newMap)
      } catch (err) {
        console.error('Error fetching discounts:', err)
      }
    }

    fetchDiscounts()
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
        const now = new Date()
        const activeRebate =
          typeof product.price_usa_rebate === 'number' &&
          product.price_usa_rebate > 0 &&
          (!product.date_rebate || new Date(product.date_rebate) >= now)
        setIsRebateActive(activeRebate)

        const basePriceUsd = activeRebate
          ? product.price_usa_rebate
          : typeof product.price_usd === 'number' && product.price_usd > 0
            ? product.price_usd
            : null
        const baseCostUsd = activeRebate ? product.price_cost_rebate || 0 : product.price_cost || 0

        let priceNat =
          typeof product.price_nationalized_sales === 'number' &&
          product.price_nationalized_sales > 0
            ? product.price_nationalized_sales
            : null
        const costNat = product.price_nationalized_cost || 0

        const { data: priceSettings } = await supabase
          .from('price_settings')
          .select('exchange_rate, freight_per_kg_usd, weight_margin')
          .single()

        if (activeRebate && priceSettings) {
          const weightKg = (product.weight || 0) * 0.453592
          const freight =
            (weightKg + (priceSettings.weight_margin || 0)) *
            (priceSettings.freight_per_kg_usd || 120)
          const calcUsd = basePriceUsd + freight
          priceNat = calcUsd * (priceSettings.exchange_rate || 5.0)
        }

        const fallbackOriginal = basePriceUsd !== null ? basePriceUsd : priceNat
        const fallbackCurrency = basePriceUsd !== null ? 'USD' : 'BRL'
        const displayOriginalUsd =
          typeof product.price_usd === 'number' && product.price_usd > 0
            ? product.price_usd
            : basePriceUsd

        setOriginalPrice(activeRebate ? displayOriginalUsd : fallbackOriginal)
        setOriginalPriceNat(priceNat)
        setCurrency(fallbackCurrency)

        if (basePriceUsd === null && priceNat === null) {
          setDiscountedPrice(null)
          setDiscountedPriceNat(null)
          return
        }

        const { data: sessionData } = await supabase.auth.getSession()
        let userRole = 'customer'
        if (sessionData?.session?.user) {
          const { data: customer } = await supabase
            .from('customers')
            .select('role')
            .eq('user_id', sessionData.session.user.id)
            .single()
          if (customer) userRole = customer.role
        }

        const { data: discounts } = await supabase
          .from('discounts')
          .select('*')
          .eq('is_active', true)

        const validDiscounts = (discounts || []).filter((rule) => {
          if (activeRebate && userRole === 'customer') return false
          if (activeRebate && userRole !== 'vip' && userRole !== 'reseller' && userRole !== 'admin')
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
            return (
              Array.isArray(rule.product_selection) && rule.product_selection.includes(product.id)
            )
          if (targetType === 'manufacturer')
            return (
              Array.isArray(rule.manufacturer_ids) &&
              rule.manufacturer_ids.includes(product.manufacturer_id)
            )
          if (targetType === 'category')
            return (
              Array.isArray(rule.category_ids) && rule.category_ids.includes(product.category_id)
            )
          if (targetType === 'manufacturer_category')
            return (
              Array.isArray(rule.manufacturer_ids) &&
              rule.manufacturer_ids.includes(product.manufacturer_id) &&
              Array.isArray(rule.category_ids) &&
              rule.category_ids.includes(product.category_id)
            )
          if (Array.isArray(rule.product_selection))
            return rule.product_selection.includes(product.id)
          return false
        })

        if (validDiscounts.length === 0) {
          setDiscountedPrice(fallbackOriginal)
          setDiscountedPriceNat(priceNat)
          setDiscountPercentage(
            activeRebate && displayOriginalUsd
              ? calculateDiscountPercentage(displayOriginalUsd, fallbackOriginal)
              : 0,
          )
          setRuleName(activeRebate ? 'REBATE' : null)
          return
        }

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
        if (activeRebate && displayOriginalUsd && basePriceUsd !== null) {
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

        setDiscountedPrice(
          basePriceUsd !== null
            ? hasUsdDiscount
              ? lowestPriceUsd
              : basePriceUsd
            : hasNatDiscount
              ? lowestPriceNat
              : priceNat,
        )
        setDiscountedPriceNat(hasNatDiscount ? lowestPriceNat : priceNat)
        setDiscountPercentage(finalDiscountPercentage)
        setRuleName(finalBestRule ? finalBestRule.name : activeRebate ? 'REBATE' : null)
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
