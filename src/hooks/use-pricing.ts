import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { calculateFinalPrice } from '@/utils/pricing'

export interface PricingConfig {
  exchange_rate: number
  spread_percentage: number
  weight_factor: number
  fixed_import_fee: number
}

interface PriceDisplay {
  label: string
  value: number
  currency: string
}

export function usePricing(product: any) {
  const [config, setConfig] = useState<PricingConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const { data: priceSettings } = await supabase
          .from('price_settings')
          .select('exchange_rate, exchange_spread')
          .limit(1)
          .maybeSingle()

        const { data: appSettings } = await supabase
          .from('app_settings')
          .select('setting_key, setting_value, setting_value_numeric')
          .in('setting_key', [
            'shipping_sao_paulo_price_per_kg',
            'shipping_sao_paulo_percentage_value',
            'shipping_sao_paulo_additional_weight_kg',
          ])

        let pricePerKg = 0
        let percentageValue = 0
        let additionalWeightKg = 0.5

        appSettings?.forEach((setting) => {
          const val = setting.setting_value_numeric ?? Number(setting.setting_value)
          if (setting.setting_key === 'shipping_sao_paulo_price_per_kg')
            pricePerKg = isNaN(val) ? 0 : val
          if (setting.setting_key === 'shipping_sao_paulo_percentage_value')
            percentageValue = isNaN(val) ? 0 : val
          if (setting.setting_key === 'shipping_sao_paulo_additional_weight_kg')
            additionalWeightKg = isNaN(val) ? 0.5 : val
        })

        const exchange_rate =
          (Number(priceSettings?.exchange_rate) || 0) +
          (Number(priceSettings?.exchange_spread) || 0)

        setConfig({
          exchange_rate,
          spread_percentage: 0,
          weight_factor: pricePerKg,
          fixed_import_fee: percentageValue,
          additionalWeightKg,
        } as any)
      } catch (err) {
        console.error('Error fetching config:', err)
        setConfig({
          exchange_rate: 5.0,
          spread_percentage: 0,
          weight_factor: 0,
          fixed_import_fee: 0,
          additionalWeightKg: 0.5,
        } as any)
      } finally {
        setIsLoading(false)
      }
    }
    fetchConfig()
  }, [])

  if (!product) {
    return { primaryPrice: null, secondaryPrice: null, baseUsaPrice: 0, isLoading }
  }

  const baseUsaPrice = calculateFinalPrice(product)
  const priceNationalizedSales = Number(product.price_nationalized_sales) || 0
  const priceNationalizedCurrency = product.price_nationalized_currency || 'BRL'
  const weight = Number(product.weight) || 0

  const exchangeRate = Number(config?.exchange_rate) || 5.0
  const pricePerKg = Number(config?.weight_factor) || 0
  const percentageValue = Number(config?.fixed_import_fee) || 0
  const additionalWeightKg = Number((config as any)?.additionalWeightKg) || 0.5

  const calculateBRL = (baseUsd: number, weightLb: number = 0) => {
    if (!exchangeRate) return 0
    if (weightLb <= 0) return 0

    const weight_kg = weightLb / 2.204
    const total_weight_kg = weight_kg + additionalWeightKg
    const freight_usd = total_weight_kg * pricePerKg
    const percentage_charge = (baseUsd * percentageValue) / 100
    const total_usd = baseUsd + freight_usd + percentage_charge

    return total_usd * exchangeRate
  }

  let primaryPrice: PriceDisplay | null = null
  let secondaryPrice: PriceDisplay | null = null

  const hasNationalized = priceNationalizedSales > 0

  if (hasNationalized) {
    let nationalizedVal = 0
    if (priceNationalizedCurrency === 'USD') {
      nationalizedVal = calculateBRL(priceNationalizedSales, 0)
    } else {
      nationalizedVal = priceNationalizedSales
    }

    primaryPrice = {
      label: 'Brasil',
      value: nationalizedVal,
      currency: 'BRL',
    }

    if (baseUsaPrice > 0) {
      secondaryPrice = {
        label: 'USA',
        value: baseUsaPrice,
        currency: 'USD',
      }
    }
  } else if (baseUsaPrice > 0) {
    primaryPrice = {
      label: 'USA',
      value: baseUsaPrice,
      currency: 'USD',
    }
    if (weight > 0) {
      secondaryPrice = {
        label: 'Brasil',
        value: calculateBRL(baseUsaPrice, weight),
        currency: 'BRL',
      }
    }
  }

  return { primaryPrice, secondaryPrice, baseUsaPrice, isLoading }
}
