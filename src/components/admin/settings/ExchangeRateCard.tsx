import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { Loader2, RefreshCw } from 'lucide-react'

export function ExchangeRateCard() {
  const [rateData, setRateData] = useState<any>(null)
  const [now, setNow] = useState(new Date())
  const [updating, setUpdating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRate()
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchRate = async () => {
    try {
      const { data, error } = await supabase.from('exchange_rate').select('*').limit(1).single()
      if (error && error.code !== 'PGRST116') throw error
      if (data) setRateData(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
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

  let diffMinutes = 0
  let isCached = false

  if (rateData?.last_updated) {
    const diffMs = Math.max(0, now.getTime() - new Date(rateData.last_updated).getTime())
    diffMinutes = Math.floor(diffMs / 60000)
    if (diffMinutes < 10) {
      isCached = true
    }
  }

  const getNextUpdateDate = (currentDate: Date) => {
    const next = new Date(currentDate.getTime())
    next.setUTCMinutes(15)
    next.setUTCSeconds(0)
    next.setUTCMilliseconds(0)

    const currentUTCHour = currentDate.getUTCHours()
    const currentUTCMinute = currentDate.getUTCMinutes()

    const scheduleHours = [12, 15, 18, 21]

    const nextHour = scheduleHours.find(
      (h) => h > currentUTCHour || (h === currentUTCHour && currentUTCMinute < 15),
    )

    if (nextHour === undefined) {
      next.setUTCDate(next.getUTCDate() + 1)
      next.setUTCHours(12)
    } else {
      next.setUTCHours(nextHour)
    }

    return next
  }

  const nextUpdate = getNextUpdateDate(now)
  const nextUpdateDiffMs = Math.max(0, nextUpdate.getTime() - now.getTime())
  const nextUpdateDiffMinutes = Math.ceil(nextUpdateDiffMs / 60000)

  const formatNextUpdate = () => {
    if (nextUpdateDiffMinutes < 60) {
      return `${nextUpdateDiffMinutes} minutos`
    }
    const hours = Math.floor(nextUpdateDiffMinutes / 60)
    const mins = nextUpdateDiffMinutes % 60
    if (mins === 0) return `${hours} hora${hours > 1 ? 's' : ''}`
    return `${hours} hora${hours > 1 ? 's' : ''} e ${mins} minuto${mins > 1 ? 's' : ''}`
  }

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleString('pt-BR')
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-xl">Taxa de Cambio (USD para BRL)</CardTitle>
          <CardDescription>
            Gerenciamento da taxa de cambio utilizada para conversao de precos.
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
                    ? 'bg-yellow-500 hover:bg-yellow-600 border-transparent text-white'
                    : 'bg-emerald-500 hover:bg-emerald-600 border-transparent text-white'
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
                {formatNextUpdate()} (às{' '}
                {nextUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
              </span>
            </div>
            <div>
              <span className="font-semibold">Ultima atualizacao:</span>{' '}
              <span className="text-muted-foreground">{formatDateTime(rateData.last_updated)}</span>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            Nenhuma taxa de cambio configurada.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
