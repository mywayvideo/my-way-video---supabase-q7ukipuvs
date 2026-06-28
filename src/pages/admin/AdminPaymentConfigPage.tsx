import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, CreditCard, Save, ArrowLeft } from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import {
  getPaymentMethodsConfig,
  savePaymentMethodsConfig,
  PAYMENT_METHOD_LABELS,
} from '@/services/paymentConfigService'

export default function AdminPaymentConfigPage() {
  const { currentUser: user, loading: authLoading } = useAuthContext()
  const [config, setConfig] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const data = await getPaymentMethodsConfig()
      setConfig(data)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggle = (method: string) => {
    setConfig((prev) => ({ ...prev, [method]: !prev[method] }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await savePaymentMethodsConfig(config)
      toast({ title: 'Sucesso', description: 'Configurações de pagamento atualizadas.' })
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (authLoading || isLoading)
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
      </div>
    )
  if (!user) return <Navigate to="/login" replace />

  return (
    <AdminLayout breadcrumb="Configurar Pagamentos">
      <div className="max-w-4xl space-y-6 animate-fade-in">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <CreditCard className="w-6 h-6" />
            </div>
            Configurar Pagamentos
          </h1>
          <p className="text-muted-foreground mt-2">
            Ative ou desative os métodos de pagamento disponíveis no checkout.
          </p>
        </div>

        <Card className="border-border/50 shadow-sm bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Métodos de Pagamento</CardTitle>
            <CardDescription>
              Controle quais métodos de pagamento aparecem no checkout
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {PAYMENT_METHOD_LABELS.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between py-4 border-b border-border/30 last:border-0"
              >
                <div>
                  <Label htmlFor={`switch-${method.id}`} className="cursor-pointer font-semibold">
                    {method.label}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-0.5">{method.description}</p>
                </div>
                <Switch
                  id={`switch-${method.id}`}
                  checked={config[method.id] ?? true}
                  onCheckedChange={() => handleToggle(method.id)}
                />
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AdminLayout>
  )
}
