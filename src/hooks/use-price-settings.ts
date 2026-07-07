import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { PriceSettingsData } from '@/utils/pricing-engine'

let cachedSettings: PriceSettingsData | null = null
let fetchPromise: Promise<PriceSettingsData | null> | null = null

export function usePriceSettings() {
  const [settings, setSettings] = useState<PriceSettingsData | null>(cachedSettings)
  const [loading, setLoading] = useState(!cachedSettings)

  useEffect(() => {
    if (cachedSettings) {
      setSettings(cachedSettings)
      setLoading(false)
      return
    }

    if (!fetchPromise) {
      fetchPromise = supabase
        .from('price_settings')
        .select('markup, freight_per_kg_usd, weight_margin, exchange_rate, exchange_spread')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            cachedSettings = {
              markup: Number(data.markup) || 0,
              freight_per_kg_usd: Number(data.freight_per_kg_usd) || 0,
              weight_margin: Number(data.weight_margin) || 0,
              exchange_rate: Number(data.exchange_rate) || 0,
              exchange_spread: Number(data.exchange_spread) || 0,
            }
            return cachedSettings
          }
          return null
        })
        .catch(() => null)
    }

    fetchPromise.then((res) => {
      setSettings(res)
      setLoading(false)
    })
  }, [])

  return { settings, loading }
}
