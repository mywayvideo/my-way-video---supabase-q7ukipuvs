import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

export function SaoPauloFormulaSection() {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [pricePerKg, setPricePerKg] = useState(120)
  const [additionalWeight, setAdditionalWeight] = useState(0.5)
  const [percentageValue, setPercentageValue] = useState(10)

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value, setting_value_numeric')
        .in('setting_key', [
          'shipping_sao_paulo_price_per_kg',
          'shipping_sao_paulo_additional_weight_kg',
          'shipping_sao_paulo_percentage_value',
        ])

      if (data) {
        data.forEach((item) => {
          if (item.setting_key === 'shipping_sao_paulo_price_per_kg') {
            const val = item.setting_value !== null ? Number(item.setting_value) : NaN
            setPricePerKg(item.setting_value_numeric ?? (isNaN(val) ? 120 : val))
          }
          if (item.setting_key === 'shipping_sao_paulo_additional_weight_kg') {
            const val = item.setting_value !== null ? Number(item.setting_value) : NaN
            setAdditionalWeight(item.setting_value_numeric ?? (isNaN(val) ? 0.5 : val))
          }
          if (item.setting_key === 'shipping_sao_paulo_percentage_value') {
            const val = item.setting_value !== null ? Number(item.setting_value) : NaN
            setPercentageValue(item.setting_value_numeric ?? (isNaN(val) ? 10 : val))
          }
        })
      }
      setIsLoading(false)
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    if (pricePerKg < 0 || percentageValue < 0 || additionalWeight < 0) {
      toast({ title: 'Valores devem ser positivos.', variant: 'destructive' })
      return
    }

    setIsSaving(true)

    try {
      const settings = [
        {
          setting_key: 'shipping_sao_paulo_price_per_kg',
          setting_value: String(pricePerKg),
          setting_value_numeric: pricePerKg,
        },
        {
          setting_key: 'shipping_sao_paulo_additional_weight_kg',
          setting_value: String(additionalWeight),
          setting_value_numeric: additionalWeight,
        },
        {
          setting_key: 'shipping_sao_paulo_percentage_value',
          setting_value: String(percentageValue),
          setting_value_numeric: percentageValue,
        },
      ]

      for (const setting of settings) {
        const { data: existing } = await supabase
          .from('app_settings')
          .select('id')
          .eq('setting_key', setting.setting_key)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('app_settings')
            .update({
              setting_value: setting.setting_value,
              setting_value_numeric: setting.setting_value_numeric,
            })
            .eq('id', existing.id)
        } else {
          await supabase.from('app_settings').insert(setting)
        }
      }

      toast({ title: 'Formula de frete atualizada com sucesso!' })
    } catch (e) {
      toast({ title: 'Erro ao processar. Tente novamente.', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Frete Internacional (Sao Paulo)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Preco por kg (USD)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={pricePerKg}
              onChange={(e) => setPricePerKg(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Peso Adicional (kg)</Label>
            <Input
              type="number"
              min="0"
              max="50"
              step="0.1"
              value={additionalWeight}
              onChange={(e) => setAdditionalWeight(parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Peso da caixa master ou embalagem adicional
            </p>
          </div>
          <div className="space-y-2">
            <Label>Percentual sobre valor (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={percentageValue}
              onChange={(e) => setPercentageValue(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="p-3 bg-secondary/50 rounded text-sm text-muted-foreground font-mono">
          Fórmula: Frete USD = (Valor Produto USD x Percentual) + ((Peso em kg + Peso Adicional em
          kg) x Preço por kg)
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          Salvar Formula
        </Button>
      </CardContent>
    </Card>
  )
}
