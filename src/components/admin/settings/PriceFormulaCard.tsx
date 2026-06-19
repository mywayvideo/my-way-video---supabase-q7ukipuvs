import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Loader2, Edit2, Save, X } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'

export function PriceFormulaCard() {
  const { currentUser: user } = useAuthContext()
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string>('Sistema')

  const [data, setData] = useState({
    exchange_rate: 5.2655,
    exchange_spread: 0.2,
    freight_per_kg_usd: 120,
    weight_margin: 0.5,
    markup: 0.8,
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const { data: res, error } = await supabase
        .from('price_settings' as any)
        .select('*')
        .limit(1)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      if (res) {
        setData({
          exchange_rate: res.exchange_rate,
          exchange_spread: res.exchange_spread,
          freight_per_kg_usd: res.freight_per_kg_usd,
          weight_margin: res.weight_margin,
          markup: res.markup,
        })
        setSettingsId(res.id)
        setUpdatedAt(res.updated_at)
        if (res.updated_by) {
          const { data: userData } = await supabase
            .from('customers')
            .select('full_name, email')
            .eq('user_id', res.updated_by)
            .single()
          if (userData) setUpdatedBy(userData.full_name || userData.email || 'Admin')
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        exchange_rate: Number(data.exchange_rate),
        exchange_spread: Number(data.exchange_spread),
        freight_per_kg_usd: Number(data.freight_per_kg_usd),
        weight_margin: Number(data.weight_margin),
        markup: Number(data.markup),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      }

      const { error } = settingsId
        ? await supabase
            .from('price_settings' as any)
            .update(payload)
            .eq('id', settingsId)
        : await supabase.from('price_settings' as any).insert([payload])

      if (error) throw error

      toast({ title: 'Configuracoes atualizadas com sucesso!' })
      setIsEditing(false)
      fetchSettings()
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao salvar configuracoes.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR')}`
  }

  // Calculation Math
  const weightLbs = 0.88
  const priceUsd = 199

  const margin = Number(data.weight_margin)
  const kgRaw = (weightLbs + margin) / 2.204
  const kgFixed = parseFloat(kgRaw.toFixed(3))
  const kgStr = kgFixed.toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })

  const freightUsdFixed = Math.round(kgFixed * Number(data.freight_per_kg_usd) * 100) / 100
  const freightUsdStr = freightUsdFixed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const totalUsdFixed = priceUsd + freightUsdFixed
  const totalUsdStr = totalUsdFixed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const priceMarkupFixed = Math.round((totalUsdFixed / Number(data.markup)) * 100) / 100
  const priceMarkupStr = priceMarkupFixed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const effRateRaw = Number(data.exchange_rate) + Number(data.exchange_spread)
  const effRateFixed = parseFloat(effRateRaw.toFixed(4))
  const effRateStr = effRateFixed.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })

  const finalBrlRaw = priceMarkupFixed * effRateFixed
  const finalBrlStr = finalBrlRaw.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <Card className="border-border/50 shadow-sm mt-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-xl">Configuracoes de Preco e Cambio</CardTitle>
          <CardDescription>
            Formula base para calculo e conversao de precos de produtos.
          </CardDescription>
        </div>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} variant="outline" className="gap-2">
            <Edit2 className="w-4 h-4" /> Editar
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setIsEditing(false)
                fetchSettings()
              }}
            >
              <X className="w-4 h-4 mr-2" /> Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{' '}
              Salvar
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <div className="space-y-2">
            <Label>Taxa de Cambio USD para BRL</Label>
            <Input
              name="exchange_rate"
              type="number"
              step="0.0001"
              value={data.exchange_rate}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </div>
          <div className="space-y-2">
            <Label>Spread de Cambio</Label>
            <Input
              name="exchange_spread"
              type="number"
              step="0.01"
              value={data.exchange_spread}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </div>
          <div className="space-y-2">
            <Label>Frete por kg em USD</Label>
            <Input
              name="freight_per_kg_usd"
              type="number"
              step="0.01"
              value={data.freight_per_kg_usd}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </div>
          <div className="space-y-2">
            <Label>Margem de Peso em Libras</Label>
            <Input
              name="weight_margin"
              type="number"
              step="0.1"
              value={data.weight_margin}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </div>
          <div className="space-y-2">
            <Label>Markup (multiplicador)</Label>
            <Input
              name="markup"
              type="number"
              step="0.01"
              value={data.markup}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </div>
        </div>

        {updatedAt && (
          <p className="text-sm text-muted-foreground mb-6">
            Ultima atualizacao: {formatDateTime(updatedAt)} por {updatedBy}
          </p>
        )}

        <div className="bg-muted p-5 rounded-lg border border-border/50 text-sm font-mono space-y-2.5 shadow-inner">
          <p className="font-semibold text-foreground mb-4 text-base">
            Exemplo de calculo: Produto US$ 199 com peso 0.88 lb
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Passo 1:</span> Converter peso para kg:{' '}
            <br className="sm:hidden" />
            (0.88 + {data.weight_margin.toString().replace('.', ',')}) / 2.204 ={' '}
            <span className="text-foreground font-semibold">{kgStr} kg</span>
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Passo 2:</span> Calcular frete em USD:{' '}
            <br className="sm:hidden" />
            {kgStr} kg * {data.freight_per_kg_usd.toString().replace('.', ',')} USD/kg ={' '}
            <span className="text-foreground font-semibold">US$ {freightUsdStr}</span>
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Passo 3:</span> Somar preco + frete (ambos
            em USD): <br className="sm:hidden" />
            199 + {freightUsdStr} ={' '}
            <span className="text-foreground font-semibold">US$ {totalUsdStr}</span>
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Passo 4:</span> Aplicar markup:{' '}
            <br className="sm:hidden" />
            {totalUsdStr} / {data.markup.toString().replace('.', ',')} ={' '}
            <span className="text-foreground font-semibold">US$ {priceMarkupStr}</span>
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Passo 5:</span> Converter para reais:{' '}
            <br className="sm:hidden" />
            Taxa efetiva = {data.exchange_rate.toString().replace('.', ',')} +{' '}
            {data.exchange_spread.toString().replace('.', ',')} ={' '}
            <span className="text-foreground font-semibold">{effRateStr}</span>
          </p>
          <div className="pt-4 mt-4 border-t border-border/60">
            <p className="text-base text-foreground">
              <span className="font-bold text-lg">Preco BRL final:</span>{' '}
              <br className="sm:hidden" />
              {priceMarkupStr} * {effRateStr} ={' '}
              <span className="font-extrabold text-lg text-primary">R$ {finalBrlStr}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
