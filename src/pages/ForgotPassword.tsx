import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Mail, ArrowLeft, Loader2 } from 'lucide-react'
import logoImg from '../assets/mw_logo_horiz_1200x318_fundo_escuro-037e3.png'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    try {
      const emailTrimmed = email.trim()

      const { data: legacyUsers } = await supabase.rpc('check_legacy_user', {
        email_input: emailTrimmed,
      })

      if (legacyUsers && legacyUsers.length > 0) {
        const legacyUser = legacyUsers[0]
        if (legacyUser.found) {
          await supabase.rpc('mark_migration_started', { target_email: emailTrimmed })
        }
      }

      const { error } = await supabase.auth.resetPasswordForEmail(emailTrimmed, {
        redirectTo: window.location.origin + '/reset-password',
      })

      if (error) throw error

      toast({
        title: 'Sucesso',
        description:
          'Se este e-mail estiver em nossa base, você receberá um link para definir sua nova senha.',
      })
      setEmail('')
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: 'Erro ao enviar e-mail. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4 relative overflow-hidden pt-12 pb-12">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="w-full max-w-[400px] z-10 animate-fade-in-up">
        <div className="flex justify-center mb-6">
          <Link to="/" className="hover:scale-105 transition-transform">
            <img src={logoImg} alt="Logo" className="w-[180px] object-contain" />
          </Link>
        </div>

        <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 relative">
          <div className="mb-6">
            <Link
              to="/login"
              className="inline-flex items-center text-sm text-zinc-400 hover:text-white transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para login
            </Link>
            <h1 className="text-xl font-bold text-white mb-2">Recuperar Senha</h1>
            <p className="text-sm text-zinc-400">
              Digite seu e-mail para receber as instruções de redefinição.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-white">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="bg-zinc-900 border-zinc-800 text-white h-11 rounded-xl text-sm pl-9 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-[#FF6600] hover:bg-[#FF6600]/90 text-white h-11 rounded-xl mt-6"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Enviar Instruções'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
