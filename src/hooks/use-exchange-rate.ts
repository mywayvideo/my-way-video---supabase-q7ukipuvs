import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

let cachedRate: number | null = null
let fetchPromise: Promise<number> | null = null

export function useExchangeRate() {
  const [rate, setRate] = useState<number>(cachedRate || 5)

  useEffect(() => {
    if (cachedRate) {
      setRate(cachedRate)
      return
    }

    if (!fetchPromise) {
      fetchPromise = supabase
        .from('price_settings')
        .select('exchange_rate, exchange_spread')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const val = (data.exchange_rate || 0) + (data.exchange_spread || 0)
            cachedRate = val
            return val
          }
          return 5
        })
    }

    fetchPromise.then((val) => setRate(val))
  }, [])

  return rate
}
