import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Settings, Building2, Shield, Wrench, Save, ArrowLeft } from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'

export default function SettingsPage() {
  const { currentUser: user, loading: authLoading } = useAuthContext()

  const [companyName, setCompanyName] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [companyWhatsapp, setCompanyWhatsapp] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const navigate = useNavigate()

  useEffect(() => {
    async function loadSettings() {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['company_name', 'company_address', 'company_email', 'company_whatsapp'])

      if (data && !error) {
        const name = data.find((d) => d.setting_key === 'company_name')?.setting_value
        const address = data.find((d) => d.setting_key === 'company_address')?.setting_value
        const email = data.find((d) => d.setting_key === 'company_email')?.setting_value
        const whatsapp = data.find((d) => d.setting_key === 'company_whatsapp')?.setting_value

        if (name) setCompanyName(name)
        if (address) setCompanyAddress(address)
        if (email) setCompanyEmail(email)
        if (whatsapp) setCompanyWhatsapp(whatsapp)
      }
      setIsLoading(false)
    }
    loadSettings()
  }, [])

  const handleSaveCompany = async () => {
    setIsSaving(true)
    try {
      const settingsToSave = [
        { setting_key: 'company_name', setting_value: companyName, updated_by_user_id: user?.id },
        {
          setting_key: 'company_address',
          setting_value: companyAddress,
          updated_by_user_id: user?.id,
        },
        { setting_key: 'company_email', setting_value: companyEmail, updated_by_user_id: user?.id },
        {
          setting_key: 'company_whatsapp',
          setting_value: companyWhatsapp,
          updated_by_user_id: user?.id,
        },
      ]

      for (const setting of settingsToSave) {
        const { error } = await supabase
          .from('app_settings')
          .upsert(setting, { onConflict: 'setting_key' })

        if (error) throw error
      }

      toast({
        title: 'Sucesso',
        description: 'Configurações da empresa atualizadas.',
      })
    } catch (error: any) {
      console.error(error)
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
    <AdminLayout breadcrumb="Configurações Globais">
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
              <Settings className="w-6 h-6" />
            </div>
            Configurações Globais
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie as configurações gerais da empresa, parâmetros operacionais e segurança.
          </p>
        </div>

        <div className="space-y-6">
          <Card className="border-border/50 shadow-sm bg-card">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Empresa</CardTitle>
                <CardDescription>Informações cadastrais exibidas em PDFs e e-mails</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="companyName">Nome da Empresa</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: My Way Video"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="companyEmail">E-mail de Contato</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  placeholder="Ex: contato@mywayvideo.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="companyAddress">Endereço</Label>
                <Input
                  id="companyAddress"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder="Ex: Miami, FL 33122"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="companyWhatsapp">WhatsApp de Atendimento</Label>
                <Input
                  id="companyWhatsapp"
                  value={companyWhatsapp}
                  onChange={(e) => setCompanyWhatsapp(e.target.value)}
                  placeholder="Ex: +1 786 716-1170 ou +55 61 99997-6505"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSaveCompany} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Configurações
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-border/50 shadow-sm bg-card">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="bg-orange-500/10 p-2 rounded-lg text-orange-500">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Operacional</CardTitle>
                <CardDescription>Parâmetros de funcionamento do sistema</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configurações operacionais estarão disponíveis em breve.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm bg-card">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="bg-red-500/10 p-2 rounded-lg text-red-500">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Segurança</CardTitle>
                <CardDescription>Autenticação, permissões e acessos</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configurações de segurança estarão disponíveis em breve.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  )
}
