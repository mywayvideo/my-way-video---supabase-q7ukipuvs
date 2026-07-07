import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { calculateFinalPrice } from '@/utils/pricing'
import {
  calculateTotalUSDFromValues,
  calculateBRLFromUSD,
  type PriceSettingsData,
  type ExchangeRateData,
} from '@/utils/pricing-engine'

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

let cachedPriceSettings: PriceSettingsData | null = null
let cachedExchangeRate: ExchangeRateData | null = null
let fetchPromise: Promise<void> | null = null

export function usePricing(product: any) {
  const [priceSettings, setPriceSettings] = useState<PriceSettingsData | null>(cachedPriceSettings)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(cachedExchangeRate)
  const [isLoading, setIsLoading] = useState(!cachedPriceSettings || !cachedExchangeRate)

  useEffect(() => {
    if (cachedPriceSettings && cachedExchangeRate) {
      setPriceSettings(cachedPriceSettings)
      setExchangeRate(cachedExchangeRate)
      setIsLoading(false)
      return
    }

    if (!fetchPromise) {
      fetchPromise = Promise.all([
        supabase
          .from('price_settings')
          .select('markup, freight_per_kg_usd, weight_margin, exchange_rate, exchange_spread')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('exchange_rate')
          .select('usd_to_brl, spread_percentage')
          .limit(1)
          .maybeSingle(),
      ])
        .then(([psRes, erRes]) => {
          if (psRes.data) {
            cachedPriceSettings = {
              markup: Number(psRes.data.markup) || 0,
              freight_per_kg_usd: Number(psRes.data.freight_per_kg_usd) || 0,
              weight_margin: Number(psRes.data.weight_margin) || 0,
              exchange_rate: Number(psRes.data.exchange_rate) || 0,
              exchange_spread: Number(psRes.data.exchange_spread) || 0,
            }
          }
          if (erRes.data) {
            cachedExchangeRate = {
              usd_to_brl: Number(erRes.data.usd_to_brl) || 0,
              spread_percentage: Number(erRes.data.spread_percentage) || 0,
            }
          }
        })
        .catch(() => {})
    }

    fetchPromise.then(() => {
      setPriceSettings(cachedPriceSettings)
      setExchangeRate(cachedExchangeRate)
      setIsLoading(false)
    })
  }, [])

  if (!product) {
    return { primaryPrice: null, secondaryPrice: null, baseUsaPrice: 0, isLoading }
  }

  const baseUsaPrice = calculateFinalPrice(product)
  const priceNationalizedSales = Number(product.price_nationalized_sales) || 0
  const priceNationalizedCurrency = product.price_nationalized_currency || 'BRL'
  const weight = Number(product.weight) || 0

  const calculateBRL = (baseUsd: number, weightLb: number) => {
    if (!priceSettings || !exchangeRate || baseUsd <= 0 || weightLb <= 0) return 0
    const totalUSD = calculateTotalUSDFromValues(baseUsd, weightLb, priceSettings)
    if (totalUSD <= 0) return 0
    return calculateBRLFromUSD(totalUSD, exchangeRate)
  }

  let primaryPrice: PriceDisplay | null = null
  let secondaryPrice: PriceDisplay | null = null

  const hasNationalized = priceNationalizedSales > 0

  if (hasNationalized) {
    let nationalizedVal = 0
    if (priceNationalizedCurrency === 'USD') {
      nationalizedVal = exchangeRate ? calculateBRLFromUSD(priceNationalizedSales, exchangeRate) : 0
    } else {
      nationalizedVal = priceNationalizedSales
    }

    primaryPrice = { label: 'Brasil', value: nationalizedVal, currency: 'BRL' }

    if (baseUsaPrice > 0) {
      secondaryPrice = { label: 'USA', value: baseUsaPrice, currency: 'USD' }
    }
  } else if (baseUsaPrice > 0) {
    primaryPrice = { label: 'USA', value: baseUsaPrice, currency: 'USD' }
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
