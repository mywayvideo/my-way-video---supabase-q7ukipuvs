import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'

const Field = ({ id, icon: Icon, right, disabled, ...p }: any) => (
  <div className="relative">
    {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />}
    <Input
      id={id}
      disabled={disabled}
      className={`bg-zinc-900 border-zinc-800 text-white h-11 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed ${Icon ? 'pl-9' : 'pl-3'} ${right ? 'pr-9' : ''}`}
      {...p}
    />
    {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
  </div>
)

export function MigrationForm({
  email,
  initialData,
  onCancel,
  onProcessing,
  onError,
}: {
  email: string
  initialData: any
  onCancel: () => void
  onProcessing?: () => void
  onError?: () => void
}) {
  type ActivationStatus = 'idle' | 'processing' | 'success' | 'error'
  const [activationStatus, setActivationStatus] = useState<ActivationStatus>('idle')

  const [f, setF] = useState({
    pwd: '',
    conf: '',
  })
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const hndl = (k: string) => (e: any) => setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.pwd.length < 8) return setErr('A senha deve ter no mínimo 8 caracteres.')
    if (f.pwd !== f.conf) return setErr('As senhas não coincidem.')
    setActivationStatus('processing')
    if (onProcessing) onProcessing()
    setErr(null)

    try {
      await supabase.auth.signOut().catch(() => {})

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: f.pwd,
        options: { data: { name: initialData?.full_name || '' } },
      })

      if (signUpError && !signUpError.message.toLowerCase().includes('already')) throw signUpError

      const userId = signUpData?.user?.id
      if (userId && initialData?.id) {
        await new Promise((resolve) => setTimeout(resolve, 1500))

        const { error: rpcError } = await supabase.rpc('complete_user_migration', {
          cust_id: initialData.id,
          new_uid: userId,
        })

        if (rpcError) {
          alert(
            'Aviso: Erro ao sincronizar o perfil, mas sua senha foi criada. Você será redirecionado para o login.',
          )
        }
      }

      setActivationStatus('success')
      window.location.href = '/login?activated=true'
    } catch (e: any) {
      setErr(e.message || 'Erro ao ativar.')
      setActivationStatus('error')
      if (onError) onError()
    }
  }

  const isProcessing = activationStatus === 'processing' || activationStatus === 'success'
  const nome = initialData?.full_name?.split(' ')[0] || 'Cliente'

  return (
    <>
      {activationStatus === 'success' && (
        <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-500">
          <CheckCircle className="h-16 w-16 text-green-500 mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2 text-center px-4">
            Senha cadastrada com sucesso! Redirecionando para o login...
          </h2>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 animate-fade-in">
        <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-orange-200 text-sm leading-relaxed">
          Olá <strong>{nome}</strong>, crie sua nova senha para acessar o novo painel My Way.
        </div>
        {err && <div className="p-2 bg-red-500/10 text-red-500 text-sm rounded">{err}</div>}

        <div className="grid grid-cols-1 gap-3 mt-4">
          <div>
            <Label>Nova Senha *</Label>
            <Field
              icon={Lock}
              type={showPwd ? 'text' : 'password'}
              required
              value={f.pwd}
              onChange={hndl('pwd')}
              disabled={isProcessing}
              right={
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="text-zinc-500 hover:text-white"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
          </div>
          <div>
            <Label>Confirmar Senha *</Label>
            <Field
              icon={Lock}
              type={showPwd ? 'text' : 'password'}
              required
              value={f.conf}
              onChange={hndl('conf')}
              disabled={isProcessing}
            />
          </div>
        </div>

        <div className="pt-4 space-y-2">
          <Button
            type="submit"
            disabled={isProcessing}
            className="w-full bg-[#FF6600] hover:bg-[#FF6600]/90 text-white h-11 rounded-xl"
          >
            {isProcessing ? (
              <div className="flex items-center justify-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sincronizando...
              </div>
            ) : (
              'Ativar Conta'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isProcessing}
            className="w-full text-zinc-400 hover:text-white"
          >
            Voltar para Login
          </Button>
        </div>
      </form>
    </>
  )
}
