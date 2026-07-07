import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

let cachedRate: number | null = null
let fetchPromise: Promise<number | null> | null = null

export function useExchangeRate() {
  const [rate, setRate] = useState<number>(cachedRate ?? 0)

  useEffect(() => {
    if (cachedRate !== null) {
      setRate(cachedRate)
      return
    }

    if (!fetchPromise) {
      fetchPromise = supabase
        .from('exchange_rate')
        .select('usd_to_brl, spread_percentage')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const val = Number(data.usd_to_brl) * (1 + Number(data.spread_percentage) / 100)
            cachedRate = val
            return val
          }
          return null
        })
        .catch(() => null)
    }

    fetchPromise.then((val) => setRate(val ?? 0))
  }, [])

  return rate
}
