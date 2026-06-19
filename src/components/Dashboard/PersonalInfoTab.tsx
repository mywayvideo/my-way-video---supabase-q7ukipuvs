import { Customer } from '@/types/customer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { CUSTOMER_LABELS } from '@/constants/customer'
import { useState, useRef, useEffect } from 'react'
import { Pencil, Camera, Save, X, Loader2, RefreshCcw } from 'lucide-react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { customerService } from '@/services/customerService'
import { useAuthContext } from '../../contexts/AuthContext'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase/client'
import { useNavigate } from 'react-router-dom'

const formatPhone = (value: string) => {
  if (!value) return ''
  let raw = value.replace(/[^\d+]/g, '')
  if (raw.length > 0 && !raw.startsWith('+')) {
    if (raw.startsWith('55') || raw.startsWith('1')) {
      raw = '+' + raw
    } else {
      raw = '+55' + raw
    }
  }
  let digits = raw.replace(/\D/g, '')
  if (!digits) return raw
  if (digits.startsWith('55')) {
    let res = '+55'
    if (digits.length > 2) res += '-' + digits.substring(2, 4)
    if (digits.length > 4) res += '-' + digits.substring(4, 9)
    if (digits.length > 9) res += '-' + digits.substring(9, 13)
    return res
  } else {
    let ccLen = digits.startsWith('1') ? 1 : digits.length >= 2 ? 2 : digits.length
    let res = '+' + digits.substring(0, ccLen)
    let rest = digits.substring(ccLen)
    if (rest.length > 0) res += '-' + rest.substring(0, 3)
    if (rest.length > 3) res += '-' + rest.substring(3, 6)
    if (rest.length > 6) res += '-' + rest.substring(6, 10)
    return res
  }
}

const profileSchema = z.object({
  full_name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(1, 'Telefone é obrigatório'),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  company_name: z.string().optional().nullable(),
  cpf: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || val.length === 11 || val.length === 14, 'CPF inválido se fornecido'),
})

export function PersonalInfoTab({
  customer: propCustomer,
  onSave: propOnSave,
  isEditing: propIsEditing,
  setEditing: propSetEditing,
}: {
  customer?: Customer | null
  onSave?: (data: Partial<Customer>) => Promise<void>
  isEditing?: boolean
  setEditing?: (editing: boolean) => void
}) {
  const { currentUser: user, loading: authLoading } = useAuth() as any
  const nav = useNavigate()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [localCustomer, setLocalCustomer] = useState<Customer | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [retried, setRetried] = useState(false)

  const fetchProfile = async () => {
    if (!user) return
    try {
      setProfileLoading(true)
      let { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!data && !retried) {
        setRetried(true)
        await supabase.rpc('sync_current_user_profile')

        let { data: retryData, error: retryError } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!retryData && user.email) {
          const { data: finalEmailData, error: finalEmailError } = await supabase
            .from('customers')
            .select('*')
            .eq('email', user.email.trim().toLowerCase())
            .maybeSingle()

          if (finalEmailData) {
            retryData = finalEmailData
            retryError = finalEmailError
          }
        }

        if (retryError && retryError.code !== 'PGRST116') throw retryError
        setLocalCustomer(retryData)
      } else {
        if (!data && user.email) {
          const { data: emailData, error: emailError } = await supabase
            .from('customers')
            .select('*')
            .eq('email', user.email.trim().toLowerCase())
            .maybeSingle()

          if (emailData) {
            data = emailData
            error = emailError
          }
        }
        if (error && error.code !== 'PGRST116') throw error
        setLocalCustomer(data)
      }
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    if (propCustomer) {
      setLocalCustomer(propCustomer)
      setProfileLoading(false)
      return
    }
    if (user) {
      fetchProfile()
    } else if (authLoading === false) {
      nav('/login', { replace: true })
    } else {
      setProfileLoading(true)
    }
  }, [user, authLoading, propCustomer, retried, nav])

  const updateProfile = async (data: Partial<Customer>) => {
    if (!user) return
    try {
      const { error } = await supabase.from('customers').update(data).eq('user_id', user.id)
      if (error) throw error
      setLocalCustomer((prev: any) => (prev ? { ...prev, ...data } : null))
      toast.success('Perfil atualizado com sucesso!')
    } catch (err) {
      toast.error('Erro ao atualizar perfil.')
    }
  }

  const customer = propCustomer !== undefined ? propCustomer : localCustomer
  const onSave = propOnSave || updateProfile

  const [localIsEditing, setLocalIsEditing] = useState(false)
  const isEditing = propIsEditing !== undefined ? propIsEditing : localIsEditing
  const setEditing = propSetEditing || setLocalIsEditing

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      date_of_birth: '',
      gender: '',
      company_name: '',
      cpf: '',
    },
  })

  useEffect(() => {
    if (customer) {
      let formattedDate = customer.date_of_birth || ''
      if (formattedDate && formattedDate.includes('T')) {
        formattedDate = formattedDate.split('T')[0]
      } else if (formattedDate && formattedDate.includes('/')) {
        const parts = formattedDate.split('/')
        if (parts.length === 3) {
          formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`
        }
      }

      form.reset({
        full_name: customer.full_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        date_of_birth: formattedDate,
        gender: customer.gender || '',
        company_name: customer.company_name || '',
        cpf: customer.cpf || '',
      })
    }
  }, [customer, form])

  const onSubmit = async (data: z.infer<typeof profileSchema>) => {
    if (onSave) {
      await onSave(data)
      setEditing(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setIsUploading(true)
    try {
      const url = await customerService.uploadProfilePhoto(user.id, file)
      if (onSave) await onSave({ profile_photo_url: url })
    } catch (err) {
      toast.error('Erro ao fazer upload da foto.')
    } finally {
      setIsUploading(false)
    }
  }

  if (authLoading || profileLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-start">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
        <div className="flex items-center gap-6 mb-6">
          <Skeleton className="w-20 h-20 rounded-full shrink-0" />
          <div className="space-y-2 w-full max-w-sm">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={i === 5 ? 'md:col-span-2' : ''}>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!user && !authLoading) {
    return null
  }

  if (errorMsg && !propCustomer) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 border rounded-lg bg-card border-destructive/50">
        <p className="text-lg font-medium text-destructive">
          {errorMsg || 'Erro ao carregar dados. Tente novamente.'}
        </p>
        <Button
          onClick={fetchProfile}
          variant="outline"
          className="mt-2 border-destructive/50 hover:bg-destructive/10"
        >
          <RefreshCcw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (!customer && !profileLoading && !authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 border rounded-lg bg-card">
        <p className="text-lg font-medium text-muted-foreground">
          Perfil não encontrado ou não vinculado.
        </p>
        <div className="flex gap-4 mt-4">
          <Button onClick={fetchProfile} variant="outline">
            <RefreshCcw className="w-4 h-4 mr-2" />
            Tentar Novamente
          </Button>
          <Button
            onClick={async () => {
              setProfileLoading(true)
              try {
                await supabase.rpc('sync_current_user_profile')
                await fetchProfile()
              } catch (err: any) {
                toast.error('Erro ao sincronizar: ' + err.message)
                setProfileLoading(false)
              }
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            Sincronizar Meus Dados
          </Button>
        </div>
      </div>
    )
  }

  if (!customer) return null

  if (!isEditing) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold">Informações Pessoais</h2>
          <Button
            variant="outline"
            onClick={() => setEditing(true)}
            className="text-primary hover:bg-secondary hover:text-primary transition-all duration-200 flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" />
            <span>Editar</span>
          </Button>
        </div>

        <div className="flex items-center gap-6 mb-6">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center overflow-hidden border shrink-0">
            {customer.profile_photo_url ? (
              <img
                src={customer.profile_photo_url}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <Camera className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <div>
            <h3 className="text-xl font-semibold">{customer.full_name}</h3>
            <p className="text-muted-foreground">{customer.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-border">
          <div>
            <Label className="font-semibold text-foreground mb-2 block">
              {CUSTOMER_LABELS.phone}
            </Label>
            <Input
              readOnly
              value={customer.phone || '-'}
              className="bg-secondary border-none cursor-default"
            />
          </div>
          <div>
            <Label className="font-semibold text-foreground mb-2 block">
              {CUSTOMER_LABELS.cpf}
            </Label>
            <Input
              readOnly
              value={customer.cpf || '-'}
              className="bg-secondary border-none cursor-default"
            />
          </div>
          <div>
            <Label className="font-semibold text-foreground mb-2 block">
              {CUSTOMER_LABELS.date_of_birth}
            </Label>
            <Input
              readOnly
              value={
                customer.date_of_birth
                  ? new Date(
                      customer.date_of_birth +
                        (customer.date_of_birth.includes('T') ? '' : 'T12:00:00'),
                    ).toLocaleDateString('pt-BR')
                  : '-'
              }
              className="bg-secondary border-none cursor-default"
            />
          </div>
          <div>
            <Label className="font-semibold text-foreground mb-2 block">
              {CUSTOMER_LABELS.gender}
            </Label>
            <Input
              readOnly
              value={customer.gender || '-'}
              className="bg-secondary border-none cursor-default"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="font-semibold text-foreground mb-2 block">
              {CUSTOMER_LABELS.company_name}
            </Label>
            <Input
              readOnly
              value={customer.company_name || '-'}
              className="bg-secondary border-none cursor-default"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-xl font-bold">Editar Informações</h2>
      </div>

      <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary hover:bg-accent transition-all duration-200 mb-8">
        <div className="flex flex-col items-center justify-center gap-2">
          {customer.profile_photo_url ? (
            <img
              src={customer.profile_photo_url}
              alt="Profile"
              className="rounded-lg max-w-xs mt-4 object-cover"
            />
          ) : (
            <Camera className="w-12 h-12 text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground mt-2">Formatos suportados: JPG, PNG.</p>
          <Button
            type="button"
            className="mt-2 bg-primary text-primary-foreground hover:opacity-90 transition-all duration-200"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Camera className="w-4 h-4 mr-2" />
            )}
            Fazer Upload
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handlePhotoUpload}
            disabled={isUploading}
          />
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground mb-2 block">
                    {CUSTOMER_LABELS.full_name}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      className="border-input rounded-lg p-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all duration-200"
                    />
                  </FormControl>
                  <FormMessage className="text-destructive text-sm mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground mb-2 block">
                    {CUSTOMER_LABELS.email}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      {...field}
                      value={field.value || ''}
                      className="border-input rounded-lg p-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all duration-200"
                    />
                  </FormControl>
                  <FormMessage className="text-destructive text-sm mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground mb-2 block">
                    {CUSTOMER_LABELS.phone}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(formatPhone(e.target.value))
                      }}
                      value={field.value || ''}
                      placeholder="+55-00-00000-0000"
                      className="border-input rounded-lg p-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all duration-200"
                    />
                  </FormControl>
                  <FormMessage className="text-destructive text-sm mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cpf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground mb-2 block">
                    {CUSTOMER_LABELS.cpf}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="000.000.000-00"
                      className="border-input rounded-lg p-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all duration-200"
                    />
                  </FormControl>
                  <FormMessage className="text-destructive text-sm mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date_of_birth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground mb-2 block">
                    {CUSTOMER_LABELS.date_of_birth}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value || ''}
                      className="border-input rounded-lg p-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all duration-200"
                    />
                  </FormControl>
                  <FormMessage className="text-destructive text-sm mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground mb-2 block">
                    {CUSTOMER_LABELS.gender}
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className="border-input rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all duration-200">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Feminino">Feminino</SelectItem>
                      <SelectItem value="Masculino">Masculino</SelectItem>
                      <SelectItem value="Prefiro não informar">Prefiro não informar</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-destructive text-sm mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="font-semibold text-foreground mb-2 block">
                    {CUSTOMER_LABELS.company_name}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      className="border-input rounded-lg p-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all duration-200"
                    />
                  </FormControl>
                  <FormMessage className="text-destructive text-sm mt-1" />
                </FormItem>
              )}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
            <Button
              type="button"
              className="bg-secondary text-secondary-foreground hover:opacity-80 transition-all duration-200"
              onClick={() => setEditing(false)}
              disabled={form.formState.isSubmitting}
            >
              <X className="w-4 h-4 mr-2" /> Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:opacity-90 transition-all duration-200"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
