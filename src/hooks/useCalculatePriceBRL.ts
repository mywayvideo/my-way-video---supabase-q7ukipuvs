import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  calculatePriceBRL,
  type PriceSettings,
  type ExchangeRateSettings,
} from '@/services/priceBrlService'

let cachedPriceSettings: PriceSettings | null = null
let cachedExchangeRate: ExchangeRateSettings | null = null
let fetchPromise: Promise<void> | null = null

export function useCalculatePriceBRL(
  priceUsd: number | null | undefined,
  weight: number | null | undefined,
  discountPercentage: number | null | undefined,
) {
  const [priceSettings, setPriceSettings] = useState<PriceSettings | null>(cachedPriceSettings)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateSettings | null>(cachedExchangeRate)
  const [loading, setLoading] = useState(!cachedPriceSettings || !cachedExchangeRate)

  useEffect(() => {
    if (cachedPriceSettings && cachedExchangeRate) {
      setPriceSettings(cachedPriceSettings)
      setExchangeRate(cachedExchangeRate)
      setLoading(false)
      return
    }

    if (!fetchPromise) {
      fetchPromise = Promise.all([
        supabase
          .from('price_settings')
          .select('markup, freight_per_kg_usd, weight_margin')
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
      setLoading(false)
    })
  }, [])

  const calculatedPrice = calculatePriceBRL(
    priceUsd,
    weight,
    discountPercentage,
    priceSettings,
    exchangeRate,
  )

  return { calculatedPrice, loading }
}
