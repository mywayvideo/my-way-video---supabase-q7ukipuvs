import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, DollarSign } from 'lucide-react'
import { ExchangeRateCard } from '@/components/admin/settings/ExchangeRateCard'
import { PriceFormulaCard } from '@/components/admin/settings/PriceFormulaCard'
import { AdminLayout } from '@/components/admin/AdminLayout'

export default function AdminPricingPage() {
  const { currentUser: user, loading: authLoading } = useAuthContext()
  const [showPriceCost, setShowPriceCost] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      fetchSettings()
    }
  }, [user])

  const fetchSettings = async () => {
    try {
      setInitialLoading(true)
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'show_price_cost')
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setShowPriceCost(data.value === 'true')
      }
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro',
        description: 'Nao foi possivel carregar configuracoes.',
        variant: 'destructive',
      })
    } finally {
      setInitialLoading(false)
    }
  }

  const handleToggle = async (checked: boolean) => {
    setShowPriceCost(checked)
    setSaving(true)
    try {
      const stringValue = checked ? 'true' : 'false'
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'show_price_cost', value: stringValue }, { onConflict: 'key' })

      if (error) throw error
      toast({ title: 'Sucesso', description: 'Configuracao atualizada com sucesso.' })
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar a configuracao.',
        variant: 'destructive',
      })
      setShowPriceCost(!checked)
    } finally {
      setSaving(false)
    }
  }

  if (authLoading)
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
      </div>
    )
  if (!user) return <Navigate to="/login" replace />

  return (
    <AdminLayout breadcrumb="Preços & Câmbio">
      <div className="max-w-4xl space-y-6 animate-fade-in">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <DollarSign className="w-6 h-6" />
            </div>
            Preços & Câmbio
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie as taxas de câmbio, fórmulas de precificação e visibilidade de custos.
          </p>
        </div>

        {initialLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm bg-card">
              <CardHeader>
                <CardTitle className="text-lg">Exibição de Preços</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-row items-center justify-between rounded-lg border border-border/50 bg-background/50 p-4 shadow-sm">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-base font-semibold">
                      Exibir Preço de Custo (FOB Miami) para Administradores
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quando ativado, o preço de custo aparecerá na página do produto para usuários
                      admin.
                    </p>
                  </div>
                  <Switch
                    checked={showPriceCost}
                    onCheckedChange={handleToggle}
                    disabled={saving}
                  />
                </div>
              </CardContent>
            </Card>

            <ExchangeRateCard />
            <PriceFormulaCard />
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
