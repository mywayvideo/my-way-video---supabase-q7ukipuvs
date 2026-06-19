import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Loader2, RefreshCw, Edit2, Save, X } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'

export default function PricingSettings() {
  const { currentUser: user } = useAuthContext()

  // Existing Exchange Rate State
  const [rateData, setRateData] = useState<any>(null)
  const [now, setNow] = useState(new Date())
  const [updating, setUpdating] = useState(false)
  const [loading, setLoading] = useState(true)

  // New Price Settings State
  const [isEditingFormula, setIsEditingFormula] = useState(false)
  const [savingFormula, setSavingFormula] = useState(false)
  const [priceSettingsId, setPriceSettingsId] = useState<string | null>(null)
  const [formulaUpdatedAt, setFormulaUpdatedAt] = useState<string | null>(null)
  const [updatedByName, setUpdatedByName] = useState<string>('Sistema')

  const [formulaData, setFormulaData] = useState({
    exchange_rate: 5.2655,
    exchange_spread: 0.2,
    freight_per_kg_usd: 120,
    weight_margin: 0.5,
    markup: 0.8,
  })

  useEffect(() => {
    fetchRate()
    fetchFormulaSettings()

    const interval = setInterval(() => {
      setNow(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchRate = async () => {
    try {
      const { data, error } = await supabase.from('exchange_rate').select('*').limit(1).single()
      if (error && error.code !== 'PGRST116') throw error
      if (data) {
        setRateData(data)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFormulaSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('price_settings' as any)
        .select('*')
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormulaData({
          exchange_rate: data.exchange_rate,
          exchange_spread: data.exchange_spread,
          freight_per_kg_usd: data.freight_per_kg_usd,
          weight_margin: data.weight_margin,
          markup: data.markup,
        })
        setPriceSettingsId(data.id)
        setFormulaUpdatedAt(data.updated_at)

        if (data.updated_by) {
          const { data: userData } = await supabase
            .from('customers')
            .select('full_name, email')
            .eq('user_id', data.updated_by)
            .single()

          if (userData) {
            setUpdatedByName(userData.full_name || userData.email || 'Admin')
          }
        }
      }
    } catch (error) {
      console.error('Error fetching formula settings:', error)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      const { error } = await supabase.functions.invoke('update-exchange-rate')
      if (error) throw error
      await fetchRate()
      toast({ title: 'Taxa atualizada com sucesso' })
      setNow(new Date())
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao atualizar taxa. Tente novamente em 15 minutos.',
        variant: 'destructive',
      })
    } finally {
      setUpdating(false)
    }
  }

  const handleSaveFormula = async () => {
    setSavingFormula(true)
    try {
      const payload = {
        exchange_rate: Number(formulaData.exchange_rate),
        exchange_spread: Number(formulaData.exchange_spread),
        freight_per_kg_usd: Number(formulaData.freight_per_kg_usd),
        weight_margin: Number(formulaData.weight_margin),
        markup: Number(formulaData.markup),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      }

      let error
      if (priceSettingsId) {
        const { error: updateErr } = await supabase
          .from('price_settings' as any)
          .update(payload)
          .eq('id', priceSettingsId)
        error = updateErr
      } else {
        const { error: insertErr } = await supabase.from('price_settings' as any).insert([payload])
        error = insertErr
      }

      if (error) throw error

      toast({ title: 'Configuracoes atualizadas com sucesso!' })
      setIsEditingFormula(false)
      fetchFormulaSettings()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar configuracoes.',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    } finally {
      setSavingFormula(false)
    }
  }

  let diffMinutes = 0
  let isCached = false
  let nextUpdateMinutes = 15

  if (rateData?.last_updated) {
    const lastUpdated = new Date(rateData.last_updated)
    const diffMs = Math.max(0, now.getTime() - lastUpdated.getTime())
    diffMinutes = Math.floor(diffMs / 60000)

    if (diffMinutes < 10) {
      isCached = true
      nextUpdateMinutes = Math.max(1, 15 - diffMinutes)
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    const date = d.toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const time = d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    return `${date} ${time}`
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormulaData((prev) => ({ ...prev, [name]: value }))
  }

  // --- Calculation Logic ---
  const kgRaw = (0.88 + Number(formulaData.weight_margin)) / 2.204
  const kgStr = kgRaw.toFixed(3).replace('.', ',')

  const freightUsdRaw = kgRaw * Number(formulaData.freight_per_kg_usd)
  const freightUsdStr = freightUsdRaw.toFixed(2).replace('.', ',')

  const totalUsdRaw = 199 + freightUsdRaw
  const totalUsdStr = totalUsdRaw.toFixed(2).replace('.', ',')

  const priceMarkupRaw = totalUsdRaw / Number(formulaData.markup)
  const priceMarkupStr = priceMarkupRaw.toFixed(2).replace('.', ',')

  const effRateRaw = Number(formulaData.exchange_rate) + Number(formulaData.exchange_spread)
  const effRateStr = effRateRaw.toFixed(4).replace('.', ',')

  const finalBrlRaw = priceMarkupRaw * effRateRaw
  const finalBrlStr = Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(finalBrlRaw)

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl animate-fade-in">
      <h1 className="text-3xl font-bold mb-8 text-foreground">Configurações de Preços</h1>

      <div className="space-y-6">
        {/* Existing Card */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-xl">Taxa de Câmbio (USD para BRL)</CardTitle>
              <CardDescription>
                Gerenciamento da taxa de câmbio utilizada para conversão de preços.
              </CardDescription>
            </div>
            <Button
              onClick={handleUpdate}
              disabled={updating || loading}
              variant="outline"
              className="gap-2"
            >
              {updating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Atualizar Taxa Agora
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rateData ? (
              <div className="space-y-3 mt-4 text-base">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Taxa de Cambio:</span>
                  <span>{formatCurrency(rateData.usd_to_brl)}</span>
                  <Badge
                    className={
                      isCached
                        ? 'bg-yellow-500 hover:bg-yellow-600 text-white border-transparent'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent'
                    }
                  >
                    {isCached ? 'CACHE' : 'ATUALIZADA'}
                  </Badge>
                </div>
                <div>
                  <span className="font-semibold">Status:</span>{' '}
                  <span className="text-muted-foreground">
                    {isCached ? 'Em cache' : 'Atualizada agora'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">Proxima atualizacao em:</span>{' '}
                  <span className="text-muted-foreground">
                    {isCached ? `${nextUpdateMinutes} minutos` : '15 minutos'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">Ultima atualizacao:</span>{' '}
                  <span className="text-muted-foreground">
                    {formatDateTime(rateData.last_updated)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                Nenhuma taxa de câmbio configurada.
              </div>
            )}
          </CardContent>
        </Card>

        {/* New Card */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-xl">Configuracoes de Preco e Cambio</CardTitle>
              <CardDescription>
                Fórmula base para cálculo e conversão de preços de produtos.
              </CardDescription>
            </div>
            {!isEditingFormula ? (
              <Button onClick={() => setIsEditingFormula(true)} variant="outline" className="gap-2">
                <Edit2 className="w-4 h-4" /> Editar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsEditingFormula(false)
                    fetchFormulaSettings()
                  }}
                >
                  <X className="w-4 h-4 mr-2" /> Cancelar
                </Button>
                <Button onClick={handleSaveFormula} disabled={savingFormula} className="gap-2">
                  {savingFormula ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              <div className="space-y-2">
                <Label htmlFor="exchange_rate">Taxa de Cambio USD para BRL</Label>
                <Input
                  id="exchange_rate"
                  name="exchange_rate"
                  type="number"
                  step="0.0001"
                  value={formulaData.exchange_rate}
                  onChange={handleInputChange}
                  disabled={!isEditingFormula}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exchange_spread">Spread de Cambio</Label>
                <Input
                  id="exchange_spread"
                  name="exchange_spread"
                  type="number"
                  step="0.01"
                  value={formulaData.exchange_spread}
                  onChange={handleInputChange}
                  disabled={!isEditingFormula}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="freight_per_kg_usd">Frete por kg em USD</Label>
                <Input
                  id="freight_per_kg_usd"
                  name="freight_per_kg_usd"
                  type="number"
                  step="0.01"
                  value={formulaData.freight_per_kg_usd}
                  onChange={handleInputChange}
                  disabled={!isEditingFormula}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight_margin">Margem de Peso em Libras</Label>
                <Input
                  id="weight_margin"
                  name="weight_margin"
                  type="number"
                  step="0.1"
                  value={formulaData.weight_margin}
                  onChange={handleInputChange}
                  disabled={!isEditingFormula}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="markup">Markup (multiplicador)</Label>
                <Input
                  id="markup"
                  name="markup"
                  type="number"
                  step="0.01"
                  value={formulaData.markup}
                  onChange={handleInputChange}
                  disabled={!isEditingFormula}
                />
              </div>
            </div>

            {formulaUpdatedAt && (
              <p className="text-sm text-muted-foreground mb-6">
                Ultima atualizacao: {formatDateTime(formulaUpdatedAt)} por {updatedByName}
              </p>
            )}

            <div className="bg-muted p-5 rounded-lg border border-border/50 text-sm font-mono space-y-2.5 shadow-inner">
              <p className="font-semibold text-foreground mb-4 text-base">
                Exemplo de calculo: Produto US$ 199 com peso 0.88 lb
              </p>

              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Passo 1:</span> Converter peso para
                kg: <br className="sm:hidden" />
                (0.88 + {formulaData.weight_margin.toString().replace('.', ',')}) / 2.204 ={' '}
                <span className="text-foreground font-semibold">{kgStr} kg</span>
              </p>

              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Passo 2:</span> Calcular frete em USD:{' '}
                <br className="sm:hidden" />
                {kgStr} kg * {formulaData.freight_per_kg_usd.toString().replace('.', ',')} USD/kg ={' '}
                <span className="text-foreground font-semibold">US$ {freightUsdStr}</span>
              </p>

              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Passo 3:</span> Somar preco + frete
                (ambos em USD): <br className="sm:hidden" />
                199 + {freightUsdStr} ={' '}
                <span className="text-foreground font-semibold">US$ {totalUsdStr}</span>
              </p>

              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Passo 4:</span> Aplicar markup:{' '}
                <br className="sm:hidden" />
                {totalUsdStr} / {formulaData.markup.toString().replace('.', ',')} ={' '}
                <span className="text-foreground font-semibold">US$ {priceMarkupStr}</span>
              </p>

              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Passo 5:</span> Converter para reais:{' '}
                <br className="sm:hidden" />
                Taxa efetiva = {formulaData.exchange_rate.toString().replace('.', ',')} +{' '}
                {formulaData.exchange_spread.toString().replace('.', ',')} ={' '}
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
      </div>
    </div>
  )
}
