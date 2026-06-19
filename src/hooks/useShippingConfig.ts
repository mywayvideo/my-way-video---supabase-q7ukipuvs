import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

export interface WarehouseLocation {
  address: string
  latitude: number
  longitude: number
}

export interface ShippingRange {
  id: string
  min_km: number
  max_km: number
  cost_usd: number
}

export interface SaoPauloFormula {
  weight_price_per_kg: number
  value_percentage: number
}

export function useShippingConfig() {
  const [warehouse, setWarehouse] = useState<WarehouseLocation>({
    address: '',
    latitude: 0,
    longitude: 0,
  })
  const [miamiRanges, setMiamiRanges] = useState<ShippingRange[]>([])
  const [spFormula, setSpFormula] = useState<SaoPauloFormula>({
    weight_price_per_kg: 0,
    value_percentage: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'warehouse_location',
          'shipping_miami_ranges',
          'shipping_sao_paulo_formula',
        ])

      if (error) throw error

      if (data) {
        const wh = data.find((d) => d.setting_key === 'warehouse_location')?.setting_value
        if (wh) setWarehouse(JSON.parse(wh))

        const mr = data.find((d) => d.setting_key === 'shipping_miami_ranges')?.setting_value
        if (mr) {
          const parsed = JSON.parse(mr)
          setMiamiRanges(parsed.map((r: any) => ({ ...r, id: crypto.randomUUID() })))
        }

        const sp = data.find((d) => d.setting_key === 'shipping_sao_paulo_formula')?.setting_value
        if (sp) setSpFormula(JSON.parse(sp))
      }
    } catch (error) {
      toast({ title: 'Erro ao processar. Tente novamente.', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const saveSetting = async (key: string, value: any) => {
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('app_settings').upsert(
        {
          setting_key: key,
          setting_value: JSON.stringify(value),
          updated_by_user_id: userData?.user?.id,
        },
        { onConflict: 'setting_key' },
      )
      if (error) throw error
      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }

  return {
    warehouse,
    setWarehouse,
    miamiRanges,
    setMiamiRanges,
    spFormula,
    setSpFormula,
    isLoading,
    saveSetting,
  }
}
