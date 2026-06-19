import { useState, useEffect } from 'react'
import { useAdminProfile } from '@/hooks/useAdminProfile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog'
import { useAuthContext } from '@/contexts/AuthContext'

export function DashboardAdminProfile() {
  const { profile, loading, error, updateProfile, changePassword, toggle2FA, loadProfile } =
    useAdminProfile()
  const { signOut } = useAuthContext()
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    company_name: '',
    bio: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isPasswordOpen, setIsPasswordOpen] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [isToggling2FA, setIsToggling2FA] = useState(false)

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        company_name: profile.company_name || '',
        bio: profile.bio || '',
      })
    }
  }, [profile])

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={loadProfile}>Tentar novamente</Button>
      </div>
    )
  }

  if (!profile) return null

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateProfile(formData)
      toast.success('Dados atualizados com sucesso!')
    } catch (err) {
      toast.error('Não foi possível atualizar dados.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      company_name: profile.company_name || '',
      bio: profile.bio || '',
    })
  }

  const handlePasswordSubmit = async (curr: string, newP: string) => {
    try {
      await changePassword(curr, newP)
      return {}
    } catch (err: any) {
      return { error: err.message || 'Erro ao alterar senha' }
    }
  }

  const handlePasswordSuccess = async () => {
    await signOut()
  }

  const handleToggle2FA = async () => {
    setIsToggling2FA(true)
    try {
      const newState = !profile.two_factor_enabled
      const res = await toggle2FA(newState)
      if (newState && res.recoveryCodes) {
        setRecoveryCodes(res.recoveryCodes)
      } else {
        setRecoveryCodes([])
      }
      toast.success(`2FA ${newState ? 'ativado' : 'desativado'} com sucesso!`)
    } catch (err) {
      toast.error('Erro ao alternar 2FA.')
    } finally {
      setIsToggling2FA(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Seus Dados Pessoais</h2>
        <p className="text-muted-foreground">Informações da sua conta de administrador</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-sm text-muted-foreground block">Nome Completo</span>
                <span className="font-medium">{profile.full_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block">Email</span>
                <span className="font-medium">{profile.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Role</span>
                <Badge
                  variant={profile.role === 'admin' ? 'destructive' : 'default'}
                  className={
                    profile.role === 'collaborator' ? 'bg-green-600 hover:bg-green-700' : ''
                  }
                >
                  {profile.role?.toUpperCase()}
                </Badge>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block">
                  Data de Criação da Conta
                </span>
                <span className="font-medium">
                  {profile.created_at ? format(new Date(profile.created_at), 'dd/MM/yyyy') : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground block">Último Acesso</span>
                <span className="font-medium">
                  {profile.last_login
                    ? format(new Date(profile.last_login), 'dd/MM/yyyy HH:mm')
                    : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Senha</p>
                  <p className="text-sm text-muted-foreground">Atualize sua senha de acesso</p>
                </div>
                <Button variant="outline" onClick={() => setIsPasswordOpen(true)}>
                  Alterar Senha
                </Button>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium">Autenticação de Dois Fatores (2FA)</p>
                    <p className="text-sm text-muted-foreground">Camada extra de segurança</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {profile.two_factor_enabled ? 'Ativado' : 'Desativado'}
                    </span>
                    <Switch
                      checked={!!profile.two_factor_enabled}
                      onCheckedChange={handleToggle2FA}
                      disabled={isToggling2FA}
                    />
                  </div>
                </div>

                {profile.two_factor_enabled && recoveryCodes.length > 0 && (
                  <div className="bg-muted p-4 rounded-md animate-fade-in-up">
                    <p className="text-sm font-medium mb-2">
                      Códigos de Recuperação (Guarde em local seguro):
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {recoveryCodes.map((code) => (
                        <code
                          key={code}
                          className="bg-background px-2 py-1 rounded border text-center text-xs"
                        >
                          {code}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Editar Informações</CardTitle>
              <CardDescription>
                Atualize seus dados de contato e perfil profissional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome Completo</Label>
                <Input
                  id="full_name"
                  maxLength={100}
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(00) 00000-0000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_name">Empresa</Label>
                <Input
                  id="company_name"
                  maxLength={100}
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio / Descrição</Label>
                <Textarea
                  id="bio"
                  maxLength={500}
                  rows={4}
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  disabled={isSaving}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving || !formData.full_name}>
                  Salvar Alterações
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ChangePasswordDialog
        open={isPasswordOpen}
        onOpenChange={setIsPasswordOpen}
        onSuccess={handlePasswordSuccess}
        onSubmit={handlePasswordSubmit}
      />
    </div>
  )
}
