import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { z } from 'zod'

const AppSettingsSchema = z.object({
  setting_key: z.string(),
  setting_value_numeric: z.number().nullable(),
})

export function useAppSettingsRealtime() {
  const [pricePerKg, setPricePerKg] = useState<number>(120)
  const [percentageValue, setPercentageValue] = useState<number>(10)
  const [additionalWeightKg, setAdditionalWeightKg] = useState<number>(0.5)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const fetchInitialValues = async () => {
      try {
        setIsLoading(true)
        const { data, error: fetchError } = await supabase
          .from('app_settings')
          .select('setting_key, setting_value_numeric')
          .in('setting_key', [
            'shipping_sao_paulo_price_per_kg',
            'shipping_sao_paulo_percentage_value',
            'shipping_sao_paulo_additional_weight_kg',
          ])

        if (fetchError) throw fetchError

        if (data && mounted) {
          data.forEach((item) => {
            const parsed = AppSettingsSchema.safeParse(item)
            if (parsed.success && parsed.data.setting_value_numeric !== null) {
              if (parsed.data.setting_key === 'shipping_sao_paulo_price_per_kg') {
                setPricePerKg(parsed.data.setting_value_numeric)
              } else if (parsed.data.setting_key === 'shipping_sao_paulo_percentage_value') {
                setPercentageValue(parsed.data.setting_value_numeric)
              } else if (parsed.data.setting_key === 'shipping_sao_paulo_additional_weight_kg') {
                setAdditionalWeightKg(parsed.data.setting_value_numeric)
              }
            }
          })
        }
      } catch (err) {
        if (mounted) {
          setError('Nao foi possivel carregar configuracoes de frete.')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchInitialValues()

    const subscription = supabase
      .channel('app_settings_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_settings',
        },
        (payload) => {
          if (!mounted) return
          const parsed = AppSettingsSchema.safeParse(payload.new)
          if (parsed.success && parsed.data.setting_value_numeric !== null) {
            if (parsed.data.setting_key === 'shipping_sao_paulo_price_per_kg') {
              setPricePerKg(parsed.data.setting_value_numeric)
            } else if (parsed.data.setting_key === 'shipping_sao_paulo_percentage_value') {
              setPercentageValue(parsed.data.setting_value_numeric)
            } else if (parsed.data.setting_key === 'shipping_sao_paulo_additional_weight_kg') {
              setAdditionalWeightKg(parsed.data.setting_value_numeric)
            }
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Failed to subscribe to app_settings changes:', err)
        }
      })

    return () => {
      mounted = false
      supabase.removeChannel(subscription)
    }
  }, [])

  return { pricePerKg, percentageValue, additionalWeightKg, isLoading, error }
}
