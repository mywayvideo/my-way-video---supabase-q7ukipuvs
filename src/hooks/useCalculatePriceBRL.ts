import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { calculatePriceBRL, PriceSettings } from '@/services/priceBrlService'

let cachedSettings: PriceSettings | null = null
let fetchPromise: Promise<PriceSettings | null> | null = null

export function useCalculatePriceBRL(
  priceUsd: number | null | undefined,
  weight: number | null | undefined,
  discountPercentage: number | null | undefined,
) {
  const [settings, setSettings] = useState<PriceSettings | null>(cachedSettings)
  const [loading, setLoading] = useState(!cachedSettings)

  useEffect(() => {
    if (cachedSettings) {
      setSettings(cachedSettings)
      setLoading(false)
      return
    }

    if (!fetchPromise) {
      fetchPromise = supabase
      Promise.all([
        supabase
          .from('price_settings')
          .select('exchange_rate, exchange_spread')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('app_settings')
          .select('setting_key, setting_value, setting_value_numeric')
          .in('setting_key', [
            'shipping_sao_paulo_price_per_kg',
            'shipping_sao_paulo_percentage_value',
            'shipping_sao_paulo_additional_weight_kg',
          ]),
      ])
        .then(([{ data: priceSettings }, { data: appSettings }]) => {
          let price_per_kg = 0
          let percentage_value = 0
          let additional_weight_kg = 0.5

          appSettings?.forEach((setting) => {
            const val = setting.setting_value_numeric ?? Number(setting.setting_value)
            if (setting.setting_key === 'shipping_sao_paulo_price_per_kg')
              price_per_kg = isNaN(val) ? 0 : val
            if (setting.setting_key === 'shipping_sao_paulo_percentage_value')
              percentage_value = isNaN(val) ? 0 : val
            if (setting.setting_key === 'shipping_sao_paulo_additional_weight_kg')
              additional_weight_kg = isNaN(val) ? 0.5 : val
          })

          cachedSettings = {
            exchange_rate: Number(priceSettings?.exchange_rate) || 5.0,
            exchange_spread: Number(priceSettings?.exchange_spread) || 0,
            price_per_kg,
            percentage_value,
            additional_weight_kg,
          }
          return cachedSettings
        })
        .catch((err) => {
          console.error(err)
          return null
        })
    }

    fetchPromise.then((res) => {
      setSettings(res)
      setLoading(false)
    })
  }, [])

  const calculatedPrice = calculatePriceBRL(priceUsd, weight, discountPercentage, settings)

  return { calculatedPrice, loading }
}
