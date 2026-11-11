import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, KeyRound, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import {
  PASSWORD_MIN_LENGTH,
  generateStrongPassword,
  isStrongPassword,
} from '@/utils/password-generator'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: any
}

export function SetCustomerPasswordModal({ open, onOpenChange, customer }: Props) {
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  // Senha salva com sucesso: exibida uma única vez e descartada ao fechar o modal.
  const [savedPassword, setSavedPassword] = useState<string | null>(null)

  // Ao fechar (ou trocar de cliente), descarta qualquer senha da tela.
  useEffect(() => {
    if (!open) {
      setPassword('')
      setSavedPassword(null)
      setSaving(false)
    }
  }, [open])

  const handleGenerate = () => {
    setPassword(generateStrongPassword())
  }

  const handleCopy = async () => {
    if (!savedPassword) return
    try {
      await navigator.clipboard.writeText(savedPassword)
      toast({ title: 'Sucesso', description: 'Senha copiada para a área de transferência.' })
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível copiar a senha.',
        variant: 'destructive',
      })
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customer?.user_id) {
      toast({
        title: 'Erro',
        description: 'Este cliente não possui usuário de autenticação vinculado.',
        variant: 'destructive',
      })
      return
    }
    if (!isStrongPassword(password)) {
      toast({
        title: 'Erro',
        description: `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres, com maiúsculas, minúsculas, números e símbolos.`,
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('set-user-password', {
        body: { user_id: customer.user_id, password },
      })
      const fnErrorMessage =
        (error && error.message) || (data && typeof data.error === 'string' ? data.error : '')
      if (fnErrorMessage) throw new Error(fnErrorMessage)

      setSavedPassword(password)
      setPassword('')
      toast({ title: 'Sucesso', description: 'Senha definida com sucesso.' })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" /> Definir nova senha
          </DialogTitle>
          <DialogDescription>
            {customer?.full_name || customer?.email || 'Cliente'} — {customer?.email}
          </DialogDescription>
        </DialogHeader>

        {savedPassword ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Senha definida. Anote ou copie agora: ela não será exibida novamente. Passe essa
                senha ao usuário e peça que ele a altere no primeiro login.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <div className="flex gap-2">
                <Input readOnly value={savedPassword} className="font-mono" />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  <Copy className="w-4 h-4 mr-2" /> Copiar
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-customer-password">Nova senha</Label>
              <div className="flex gap-2">
                <Input
                  id="new-customer-password"
                  required
                  type="text"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  className="font-mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={handleGenerate}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Gerar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo de {PASSWORD_MIN_LENGTH} caracteres, com letras maiúsculas, minúsculas,
                números e símbolos.
              </p>
            </div>
            <Alert>
              <AlertDescription>
                Após salvar, a senha será exibida uma única vez para você copiar e repassar ao
                usuário, com o pedido para alterá-la no primeiro login.
              </AlertDescription>
            </Alert>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
