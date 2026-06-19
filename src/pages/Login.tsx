import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { Mail, Lock, Eye, EyeOff, Loader2, User, Phone, Building2 } from 'lucide-react'
import logoImg from '../assets/mw_logo_horiz_1200x318_fundo_escuro-037e3.png'

const siteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY

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

export default function Login() {
  const [tab, setTab] = useState('login')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [flowMode, setFlowMode] = useState<'login' | 'migrate' | 'loading' | 'processing'>('login')
  const [isMigrating, setIsMigrating] = useState(false)
  const [legacyData, setLegacyData] = useState<any>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaL, setCaptchaL] = useState<string | null>(null)
  const captchaRefL = useRef<HCaptcha>(null)

  const [rName, setRName] = useState('')
  const [rEmail, setREmail] = useState('')
  const [rPhone, setRPhone] = useState('')
  const [rComp, setRComp] = useState('')
  const [rPwd, setRPwd] = useState('')
  const [rPwdC, setRPwdC] = useState('')
  const [rTerms, setRTerms] = useState(false)
  const [captchaR, setCaptchaR] = useState<string | null>(null)
  const captchaRefR = useRef<HCaptcha>(null)

  const [isLoadingUserData, setIsLoadingUserData] = useState(false)
  const nav = useNavigate()
  const location = useLocation()
  const authContext = useAuthContext() as any
  const { signIn, userRole, userMetadata } = authContext
  const { toast } = useToast()

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    if (searchParams.get('activated') === 'true') {
      setEmail('')
      setPassword('')
      window.localStorage.clear()
      window.sessionStorage.clear()

      supabase.auth.signOut().then(() => {
        setTimeout(() => {
          window.history.replaceState(null, '', '/login')
        }, 100)

        setFlowMode('login')
        setIsMigrating(false)
        toast({
          title: 'Sucesso',
          description: 'Conta ativada! Por favor, faça login com sua nova senha.',
        })
      })
    }
  }, [location.search, toast])

  useEffect(() => {
    const handleSession = async (session: any) => {
      if (flowMode === 'migrate' || flowMode === 'processing' || isMigrating) return

      if (session) {
        await supabase.rpc('sync_current_user_profile')
        const { data: customer } = await supabase
          .from('customers')
          .select('has_migrated, role, email')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (customer && customer.has_migrated === false) {
          const emailToCheck = customer.email || session.user.email
          if (emailToCheck) {
            const { data: legacyDataResponse } = (await supabase.rpc('check_legacy_user', {
              email_input: emailToCheck.toLowerCase().trim(),
            } as any)) as any

            const legacyUser =
              legacyDataResponse && legacyDataResponse.length > 0 ? legacyDataResponse[0] : null

            if (legacyUser && legacyUser.found && !legacyUser.has_migrated) {
              setLegacyData(legacyUser)
              setEmail(emailToCheck)
              setFlowMode('migrate')
              return
            }
          }
          await supabase.auth.signOut()
        } else if (customer && customer.has_migrated !== false) {
          if (customer.role === 'admin') {
            nav('/admin/dashboard', { replace: true })
          } else {
            nav('/dashboard', { replace: true })
          }
        }
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (flowMode === 'migrate' || flowMode === 'processing' || isMigrating) return
      handleSession(session)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [nav, flowMode, isMigrating])

  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (isLoadingUserData && flowMode !== 'migrate' && flowMode !== 'processing' && !isMigrating) {
      if (userRole && userMetadata) {
        setIsLoadingUserData(false)
        setLoading(false)
        if (userRole === 'admin') {
          nav('/admin/dashboard', { replace: true })
        } else if (['customer', 'vip', 'reseller'].includes(userRole)) {
          nav('/', { replace: true })
        }
      } else {
        timeout = setTimeout(() => {
          setIsLoadingUserData(false)
          setLoading(false)
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar dados do usuário',
            variant: 'destructive',
          })
        }, 5000)
      }
    }
    return () => clearTimeout(timeout)
  }, [isLoadingUserData, userRole, userMetadata, nav, toast, flowMode])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    // if (!captchaL) return setError('Falha na verificacao. Tente novamente.')
    setFlowMode('loading')
    setError(null)
    setLoading(true)

    const normalizedEmail = email.toLowerCase().trim()
    let loginSuccess = false

    try {
      const res = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (res.error) {
        throw res.error
      }

      loginSuccess = true
    } catch (err: any) {
      try {
        const { data: legacyDataResponse } = (await supabase.rpc('check_legacy_user', {
          email_input: normalizedEmail,
        })) as any

        const legacyUser =
          legacyDataResponse && legacyDataResponse.length > 0 ? legacyDataResponse[0] : null

        if (legacyUser && legacyUser.found && !legacyUser.has_migrated) {
          setLegacyData(legacyUser)
          setFlowMode('migrate')
          setLoading(false)
          return
        }
      } catch (rpcErr) {
        console.error('Erro ao verificar usuario legado:', rpcErr)
      }

      setError('E-mail ou Senha não cadastrados.')
      toast({
        title: 'Erro',
        description: 'E-mail ou Senha não cadastrados.',
        variant: 'destructive',
      })
      captchaRefL.current?.resetCaptcha()
      setCaptchaL(null)
      setLoading(false)
      setFlowMode('login')
      return
    }

    if (loginSuccess) {
      try {
        await supabase.rpc('sync_current_user_profile')

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session) {
          const { data: customer } = await supabase
            .from('customers')
            .select('has_migrated, role')
            .eq('user_id', session.user.id)
            .maybeSingle()

          if (customer) {
            const targetPath = customer.role === 'admin' ? '/admin/dashboard' : '/dashboard'
            nav(targetPath, { replace: true })
            return
          }
        }

        setIsLoadingUserData(true)
        setFlowMode('login')
      } catch (err: any) {
        setLoading(false)
        setFlowMode('login')
      }
    }
  }

  const handleReg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rName || !rEmail || !rPwd || !rPwdC || !rTerms)
      return setError('Preencha os campos obrigatórios.')
    if (rPwd !== rPwdC) return setError('Senhas não coincidem.')
    if (rPwd.length < 8) return setError('Senha deve ter no mínimo 8 caracteres.')
    if (!captchaR) return setError('Falha na verificacao. Tente novamente.')

    setLoading(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-customer-public', {
        body: {
          email: rEmail,
          password: rPwd,
          name: rName,
          phone: rPhone,
          company: rComp,
          hcaptchaToken: captchaR,
        },
      })
      if (fnErr || data?.error) throw new Error(data?.error || 'Erro ao criar conta.')
      toast({ title: 'Conta criada com sucesso!', description: 'Você pode fazer login agora.' })
      setTab('login')
      setEmail(rEmail)
      setRPwd('')
      setRPwdC('')
      setRTerms(false)
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta.')
      captchaRefR.current?.resetCaptcha()
      setCaptchaR(null)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4 relative overflow-hidden pt-12 pb-12">
      {(flowMode === 'processing' || isMigrating) && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-500">
          <Loader2 className="h-12 w-12 animate-spin text-orange-500 mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2 text-center">
            Finalizando sincronização segura... Quase lá!
          </h2>
        </div>
      )}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div
        className={`w-full z-10 animate-fade-in-up ${flowMode === 'migrate' || flowMode === 'processing' || isMigrating ? 'max-w-[600px]' : 'max-w-[400px]'}`}
      >
        <div className="flex justify-center mb-6">
          <Link to="/" className="hover:scale-105 transition-transform">
            <img src={logoImg} alt="Logo" className="w-[180px] object-contain" />
          </Link>
        </div>
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 relative">
          {flowMode === 'loading' ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500 mb-4" />
              <p className="text-zinc-400">Verificando dados...</p>
            </div>
          ) : flowMode === 'migrate' || flowMode === 'processing' ? (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-xl text-orange-200 text-sm leading-relaxed text-center">
                <h3 className="text-lg font-bold text-white mb-3">
                  Bem-vindo à Nova Plataforma My Way!
                </h3>
                <p className="mb-6">
                  Olá! Identificamos que você já é nosso cliente. Estamos de cara nova para te
                  atender melhor! Por questões de segurança, nesta primeira visita, precisamos que
                  você defina uma nova senha de acesso. Clique no botão abaixo e enviaremos um link
                  de ativação agora mesmo para o seu e-mail.
                </p>
                <div className="space-y-3">
                  <Button
                    type="button"
                    onClick={async () => {
                      setIsMigrating(true)
                      try {
                        const targetEmail = legacyData?.email || email
                        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
                          targetEmail,
                          {
                            redirectTo: `${window.location.origin}/reset-password`,
                          },
                        )
                        if (resetError) throw resetError

                        const { error: rpcError } = await supabase.rpc('mark_migration_started', {
                          target_email: targetEmail.toLowerCase().trim(),
                        } as any)
                        if (rpcError) console.error('Error marking migration started:', rpcError)

                        toast({
                          title: 'Sucesso',
                          description: 'Link enviado! Verifique seu e-mail para ativar sua conta.',
                        })
                        setFlowMode('login')
                        setLegacyData(null)
                      } catch (err: any) {
                        toast({
                          title: 'Erro',
                          description:
                            'Não foi possível enviar o e-mail. Por favor, tente novamente em alguns instantes.',
                          variant: 'destructive',
                        })
                      } finally {
                        setIsMigrating(false)
                      }
                    }}
                    disabled={isMigrating}
                    className="w-full bg-[#FF6600] hover:bg-[#FF6600]/90 text-white h-11 rounded-xl"
                  >
                    {isMigrating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      'Ativar Minha Conta'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      await supabase.auth.signOut()
                      setFlowMode('login')
                      setIsMigrating(false)
                      setLegacyData(null)
                    }}
                    disabled={isMigrating}
                    className="w-full text-zinc-400 hover:text-white"
                  >
                    Voltar para Login
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Tabs
              value={tab}
              onValueChange={(v) => {
                setTab(v)
                setError(null)
              }}
            >
              <TabsList className="grid grid-cols-2 bg-zinc-900 mb-4 p-1">
                <TabsTrigger
                  value="login"
                  className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
                >
                  Entrar
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
                >
                  Criar Conta
                </TabsTrigger>
              </TabsList>

              {error && (
                <div className="mb-4 p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-lg">
                  {error}
                </div>
              )}

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Field
                      icon={Mail}
                      type="email"
                      placeholder="seu@email.com"
                      required
                      value={email}
                      autoComplete="off"
                      onChange={(e: any) => setEmail(e.target.value)}
                      disabled={loading || isLoadingUserData}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Senha</Label>
                    <Field
                      icon={Lock}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Sua senha"
                      required
                      value={password}
                      autoComplete="new-password"
                      onChange={(e: any) => setPassword(e.target.value)}
                      disabled={loading || isLoadingUserData}
                      right={
                        <button
                          type="button"
                          onClick={() => setShowPwd(!showPwd)}
                          className="text-zinc-500 hover:text-white"
                          disabled={loading || isLoadingUserData}
                        >
                          {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center text-sm pt-1 pb-2">
                    <label
                      className={`flex items-center space-x-2 text-zinc-400 cursor-pointer hover:text-zinc-300 ${loading || isLoadingUserData ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <Checkbox
                        disabled={loading || isLoadingUserData}
                        className="border-zinc-700 data-[state=checked]:bg-orange-500"
                      />
                      <span>Lembrar-me</span>
                    </label>
                    <Link
                      to="/forgot-password"
                      className={`text-orange-500 hover:text-orange-400 ${loading || isLoadingUserData ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      Esqueci minha senha
                    </Link>
                  </div>
                  {/* HCaptcha temporariamente desabilitado para testes no Login
                  <div
                    className={`flex justify-center overflow-hidden rounded-lg ${loading || isLoadingUserData ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    {!siteKey ? (
                      <div className="text-red-500 text-sm text-center py-2">
                        Configuracao de CAPTCHA ausente. Contate o administrador.
                      </div>
                    ) : (
                      <HCaptcha
                        sitekey={siteKey}
                        theme="dark"
                        onVerify={setCaptchaL}
                        onExpire={() => setCaptchaL(null)}
                        ref={captchaRefL}
                      />
                    )}
                  </div>
                  */}
                  <Button
                    type="submit"
                    disabled={loading || isLoadingUserData}
                    className="w-full bg-[#FF6600] hover:bg-[#FF6600]/90 text-white h-11 rounded-xl"
                  >
                    {loading || isLoadingUserData ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      'Entrar'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleReg} className="space-y-3" autoComplete="off">
                  <div className="space-y-1">
                    <Label>
                      Nome <span className="text-red-500">*</span>
                    </Label>
                    <Field
                      icon={User}
                      placeholder="Seu nome"
                      required
                      value={rName}
                      onChange={(e: any) => setRName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Field
                      icon={Mail}
                      type="email"
                      placeholder="seu@email.com"
                      required
                      value={rEmail}
                      onChange={(e: any) => setREmail(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Telefone</Label>
                      <Field
                        icon={Phone}
                        placeholder="(11) 9999-9999"
                        value={rPhone}
                        onChange={(e: any) => setRPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Empresa</Label>
                      <Field
                        icon={Building2}
                        placeholder="Sua empresa"
                        value={rComp}
                        onChange={(e: any) => setRComp(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>
                      Senha <span className="text-red-500">*</span>
                    </Label>
                    <Field
                      icon={Lock}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Mínimo 8 caract."
                      required
                      value={rPwd}
                      onChange={(e: any) => setRPwd(e.target.value)}
                      right={
                        <button
                          type="button"
                          onClick={() => setShowPwd(!showPwd)}
                          className="text-zinc-500"
                        >
                          {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>
                      Confirmar <span className="text-red-500">*</span>
                    </Label>
                    <Field
                      icon={Lock}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Confirme a senha"
                      required
                      value={rPwdC}
                      onChange={(e: any) => setRPwdC(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center space-x-2 text-sm text-zinc-400 pt-1 pb-1 cursor-pointer">
                    <Checkbox
                      checked={rTerms}
                      onCheckedChange={(c) => setRTerms(!!c)}
                      className="border-zinc-700 data-[state=checked]:bg-orange-500"
                    />
                    <span>Aceito os Termos de Serviço</span>
                  </label>
                  <div className="flex justify-center overflow-hidden rounded-lg">
                    {!siteKey ? (
                      <div className="text-red-500 text-sm text-center py-2">
                        Configuracao de CAPTCHA ausente. Contate o administrador.
                      </div>
                    ) : (
                      <HCaptcha
                        sitekey={siteKey}
                        theme="dark"
                        onVerify={setCaptchaR}
                        onExpire={() => setCaptchaR(null)}
                        ref={captchaRefR}
                      />
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || !captchaR || !rTerms}
                    className="w-full bg-[#FF6600] hover:bg-[#FF6600]/90 text-white h-11 rounded-xl"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Criar Conta'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  )
}
