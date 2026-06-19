import { useState, useEffect } from 'react'
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
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export function ChangePasswordDialog({
  open,
  onOpenChange,
  onSuccess,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSuccess: () => void
  onSubmit?: (curr: string, newP: string) => Promise<{ error?: string }>
}) {
  const { currentUser: user } = useAuthContext()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [currentErr, setCurrentErr] = useState('')
  const [newErrs, setNewErrs] = useState<string[]>([])
  const [confirmErr, setConfirmErr] = useState('')
  const [submitErr, setSubmitErr] = useState('')

  const [isChecking, setIsChecking] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setCurrentErr('')
      setNewErrs([])
      setConfirmErr('')
      setSubmitErr('')
      setIsChecking(false)
      setIsSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    const errs: string[] = []
    if (newPassword) {
      if (newPassword.length < 8) errs.push('Senha deve ter minimo 8 caracteres')
      if (!/[A-Z]/.test(newPassword)) errs.push('Senha deve conter pelo menos 1 maiuscula')
      if (!/[0-9]/.test(newPassword)) errs.push('Senha deve conter pelo menos 1 numero')
      if (currentPassword && newPassword === currentPassword)
        errs.push('Nova senha não pode ser igual a atual')
    }
    setNewErrs(errs)

    if (confirmPassword) {
      setConfirmErr(confirmPassword !== newPassword ? 'As senhas nao conferem' : '')
    } else {
      setConfirmErr('')
    }
  }, [newPassword, confirmPassword, currentPassword])

  const validateCurrentPassword = async () => {
    if (!currentPassword) return (setCurrentErr('Senha atual é obrigatória'), false)
    setIsChecking(true)
    setCurrentErr('')
    try {
      if (!user?.email) return (setCurrentErr('Erro ao identificar usuário'), false)
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (error) return (setCurrentErr('Senha atual incorreta'), false)
      return true
    } catch {
      return (setCurrentErr('Erro ao validar senha'), false)
    } finally {
      setIsChecking(false)
    }
  }

  const isFormValid = !!(
    currentPassword &&
    newPassword &&
    confirmPassword &&
    !newErrs.length &&
    !confirmErr &&
    !currentErr
  )

  const handleSubmit = async () => {
    if (!isFormValid) return
    setIsSubmitting(true)
    setSubmitErr('')

    if (onSubmit) {
      const res = await onSubmit(currentPassword, newPassword)
      setIsSubmitting(false)
      if (res?.error) {
        setSubmitErr(res.error)
      } else {
        onOpenChange(false)
        toast.success('Senha alterada com sucesso!')
        onSuccess()
      }
      return
    }

    const isValid = await validateCurrentPassword()
    if (!isValid) return setIsSubmitting(false)

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setIsSubmitting(false)

    if (error) {
      setSubmitErr('Nao foi possivel atualizar senha. Tente novamente.')
      console.error('Update password error:', error)
    } else {
      onOpenChange(false)
      toast.success('Senha alterada com sucesso!')
      onSuccess()
    }
  }

  let strengthLabel = 'Fraca',
    strengthColor = 'bg-red-500',
    width = '33%'
  if (newPassword) {
    const hasLength = newPassword.length >= 8
    const hasUpper = /[A-Z]/.test(newPassword)
    const hasNumber = /[0-9]/.test(newPassword)
    if (hasLength && hasUpper && hasNumber) {
      strengthLabel = 'Forte'
      strengthColor = 'bg-green-500'
      width = '100%'
    } else if (hasLength && (hasUpper || hasNumber)) {
      strengthLabel = 'Media'
      strengthColor = 'bg-yellow-500'
      width = '66%'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Senha</DialogTitle>
          <DialogDescription className="sr-only">
            Formulário para alteração de senha
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {submitErr && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              {submitErr}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Senha Atual</Label>
            <Input
              type="password"
              placeholder="Digite sua senha atual"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              onBlur={() => currentPassword && validateCurrentPassword()}
              disabled={isSubmitting || isChecking}
            />
            {currentErr && (
              <span className="text-sm text-destructive font-medium">{currentErr}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Nova Senha</Label>
            <Input
              type="password"
              placeholder="Minimo 8 caracteres, 1 maiuscula, 1 numero"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSubmitting}
            />
            {newPassword && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${strengthColor} transition-all duration-300`}
                    style={{ width }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-medium w-10 text-right">
                  {strengthLabel}
                </span>
              </div>
            )}
            {newErrs.length > 0 && newPassword && (
              <div className="flex flex-col mt-1">
                {newErrs.map((err, i) => (
                  <span key={i} className="text-xs text-destructive font-medium">
                    {err}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Confirmar Nova Senha</Label>
            <Input
              type="password"
              placeholder="Confirme a nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
            />
            {confirmErr && (
              <span className="text-sm text-destructive font-medium">{confirmErr}</span>
            )}
          </div>
        </div>
        <div className="flex justify-between mt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting || isChecking}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Atualizar Senha
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
