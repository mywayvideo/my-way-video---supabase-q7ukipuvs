import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  GripVertical,
  Edit,
  Trash2,
  Check,
  X,
  Loader2,
  Play,
  Plus,
  Network,
  Settings2,
  ArrowLeft,
} from 'lucide-react'

const providerSchema = z
  .object({
    provider_name: z.string().min(3, 'Mínimo 3 caracteres').max(50, 'Máximo 50 caracteres'),
    provider_type: z.enum(['deepseek', 'openai', 'gemini', 'custom']),
    model_id: z.string().min(3, 'Mínimo 3 caracteres').max(100, 'Máximo 100 caracteres'),
    api_key_secret_name: z
      .string()
      .regex(/^[A-Z_]+$/, 'Deve ser maiúsculo, sem espaços (ex: MINHA_CHAVE)'),
    custom_endpoint: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.provider_type === 'custom' &&
      (!data.custom_endpoint || data.custom_endpoint.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Endpoint é obrigatório para provedor customizado',
        path: ['custom_endpoint'],
      })
    }
  })

type ProviderFormValues = z.infer<typeof providerSchema>

export default function AdminAIProviders() {
  const { currentUser: user, loading: authLoading } = useAuthContext()
  const [providers, setProviders] = useState<any[]>([])

  const [loading, setLoading] = useState(true)
  const [testLoading, setTestLoading] = useState(false)
  const [isSubmitLoading, setIsSubmitLoading] = useState(false)

  const [dragItem, setDragItem] = useState<number | null>(null)
  const [dragOverItem, setDragOverItem] = useState<number | null>(null)

  const [editProvider, setEditProvider] = useState<any>(null)
  const [deleteProvider, setDeleteProvider] = useState<any>(null)

  const addForm = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      provider_name: '',
      provider_type: 'openai',
      model_id: '',
      api_key_secret_name: '',
      custom_endpoint: '',
    },
  })

  const editForm = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
  })

  const navigate = useNavigate()

  useEffect(() => {
    if (user) fetchData()
  }, [user])

  const fetchData = async () => {
    setLoading(true)
    const { data: provData } = await supabase
      .from('ai_providers')
      .select('*')
      .order('priority', { ascending: true })
    if (provData) setProviders(provData)

    setLoading(false)
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragItem(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverItem(index)
  }

  const handleDragEnd = async () => {
    if (dragItem === null || dragOverItem === null || dragItem === dragOverItem) {
      setDragItem(null)
      setDragOverItem(null)
      return
    }
    const newList = [...providers]
    const draggedContent = newList[dragItem]
    newList.splice(dragItem, 1)
    newList.splice(dragOverItem, 0, draggedContent)

    const updatedList = newList.map((p, i) => ({ ...p, priority: i + 1 }))
    setProviders(updatedList)
    setDragItem(null)
    setDragOverItem(null)

    try {
      await Promise.all(
        updatedList.map((p) =>
          supabase.from('ai_providers').update({ priority: p.priority }).eq('id', p.id),
        ),
      )
      toast({ title: 'Ordem de prioridade atualizada!' })
    } catch (err) {
      toast({ title: 'Erro ao reordenar', variant: 'destructive' })
    }
  }

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('ai_providers')
      .update({ is_active: !current })
      .eq('id', id)
    if (error) toast({ title: 'Erro ao alterar status', variant: 'destructive' })
    else {
      setProviders((p) => p.map((x) => (x.id === id ? { ...x, is_active: !current } : x)))
      toast({ title: current ? 'Provedor desativado' : 'Provedor ativado' })
    }
  }

  const testConnection = async (values: ProviderFormValues) => {
    setTestLoading(true)
    try {
      let endpoint = values.custom_endpoint || ''
      if (values.provider_type === 'openai') endpoint = 'https://api.openai.com/v1/chat/completions'
      else if (values.provider_type === 'deepseek')
        endpoint = 'https://api.deepseek.com/chat/completions'
      else if (values.provider_type === 'gemini')
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${values.model_id}:generateContent`

      const { data, error } = await supabase.functions.invoke('validate-ai-provider', {
        body: {
          model_id: values.model_id || '',
          api_key_secret_name: values.api_key_secret_name || '',
          endpoint: endpoint || 'invalid-endpoint',
          provider_type: values.provider_type || 'openai',
        },
      })

      if (error || data?.status === 'error') {
        toast({
          title: 'Falha ao conectar ao provedor',
          description:
            data?.error_details || data?.message || error?.message || 'Verifique as credenciais.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Conexão bem-sucedida!',
          description: data?.message || 'O provedor respondeu corretamente.',
        })
      }
    } catch (err: any) {
      toast({ title: 'Erro de comunicação', description: err.message, variant: 'destructive' })
    } finally {
      setTestLoading(false)
    }
  }

  const onAddSubmit = async (values: ProviderFormValues) => {
    setIsSubmitLoading(true)
    const { error } = await supabase.from('ai_providers').insert([
      {
        ...values,
        priority: providers.length + 1,
        is_active: true,
      },
    ])
    setIsSubmitLoading(false)
    if (error)
      toast({
        title: 'Falha ao adicionar provedor',
        description: error.message,
        variant: 'destructive',
      })
    else {
      toast({ title: 'Provedor adicionado com sucesso!' })
      addForm.reset()
      fetchData()
    }
  }

  const openEdit = (provider: any) => {
    setEditProvider(provider)
    editForm.reset({
      provider_name: provider.provider_name,
      provider_type: provider.provider_type || 'openai',
      model_id: provider.model_id,
      api_key_secret_name: provider.api_key_secret_name,
      custom_endpoint: provider.custom_endpoint || '',
    })
  }

  const onEditSubmit = async (values: ProviderFormValues) => {
    setIsSubmitLoading(true)
    const { error } = await supabase.from('ai_providers').update(values).eq('id', editProvider.id)
    setIsSubmitLoading(false)
    if (error)
      toast({ title: 'Falha ao atualizar', description: error.message, variant: 'destructive' })
    else {
      toast({ title: 'Provedor atualizado com sucesso!' })
      setEditProvider(null)
      fetchData()
    }
  }

  const confirmDelete = async () => {
    if (!deleteProvider) return
    const { error } = await supabase.from('ai_providers').delete().eq('id', deleteProvider.id)
    if (error) toast({ title: 'Erro ao remover', variant: 'destructive' })
    else {
      toast({ title: 'Provedor removido' })
      setDeleteProvider(null)
      fetchData()
    }
  }

  if (authLoading)
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin w-6 h-6" />
      </div>
    )
  if (!user) return <Navigate to="/login" replace />

  const renderFormFields = (form: any) => (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="provider_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nome do Provedor</FormLabel>
            <FormControl>
              <Input placeholder="Ex: OpenAI Principal" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="provider_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="custom">Customizado</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="model_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model ID</FormLabel>
              <FormControl>
                <Input placeholder="Ex: gpt-4o" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="api_key_secret_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Secret Name (Chave de API)</FormLabel>
            <FormControl>
              <Input placeholder="Ex: OPENAI_API_KEY" className="font-mono uppercase" {...field} />
            </FormControl>
            <FormDescription>Nome da variável de ambiente no Supabase</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      {form.watch('provider_type') === 'custom' && (
        <FormField
          control={form.control}
          name="custom_endpoint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endpoint Customizado</FormLabel>
              <FormControl>
                <Input placeholder="https://api.meuprovedor.com/v1/chat" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  )

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in min-h-[70vh]">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Breadcrumb className="m-0">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/admin">Admin</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Gerenciar Provedores de IA</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
          <div className="bg-primary/10 p-2 rounded-lg text-primary">
            <Network className="w-6 h-6" />
          </div>
          Gerenciar Provedores de IA
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Configure a ordem e ative/desative provedores. O agente utilizará a ordem definida aqui
          (Chain of Providers) para garantir resiliência e fallback automático.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="w-5 h-5 text-primary" /> Cadeia de Provedores Ativos (Section A)
              </CardTitle>
              <CardDescription>
                Arraste para reordenar. O primeiro da lista será tentado primeiro.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : providers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground border-t border-border/50 border-dashed m-4 rounded-lg">
                  Nenhum provedor ativo. Adicione um novo provedor abaixo.
                </div>
              ) : (
                <div className="p-4 flex flex-col gap-2">
                  {providers.map((p, index) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnter={(e) => handleDragEnter(e, index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-xl border bg-card shadow-sm cursor-move transition-all duration-200 group',
                        dragItem === index
                          ? 'opacity-40 scale-[0.99] border-primary/50'
                          : 'border-border/50 hover:border-primary/30',
                        !p.is_active && 'opacity-60 bg-muted/20',
                      )}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <GripVertical className="w-5 h-5 text-muted-foreground/50 group-hover:text-primary/50" />
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-bold text-muted-foreground border border-border/50">
                          {index + 1}
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            {p.provider_name}
                            <span className="text-[10px] uppercase font-mono tracking-wider bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                              {p.provider_type || p.provider_name}
                            </span>
                          </h4>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            {p.model_id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 border-r border-border/50 pr-4 mr-2">
                          <span className="text-xs text-muted-foreground">
                            {p.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                          <Switch
                            checked={p.is_active}
                            onCheckedChange={() => toggleActive(p.id, p.is_active)}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(p)}
                          className="h-8 w-8 hover:bg-accent hover:text-accent-foreground"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteProvider(p)}
                          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="border-border/50 shadow-sm sticky top-6">
            <CardHeader className="bg-muted/10 border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" /> Novo Provedor (Section B)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <Form {...addForm}>
                <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-6">
                  {renderFormFields(addForm)}
                  <div className="flex flex-col gap-3 pt-4 border-t border-border/50">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => testConnection(addForm.getValues())}
                      disabled={testLoading}
                      className="w-full"
                    >
                      {testLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2 text-primary" />
                      )}
                      Testar Conexão
                    </Button>
                    <Button type="submit" className="w-full" disabled={isSubmitLoading}>
                      {isSubmitLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Salvar Provedor
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!editProvider} onOpenChange={(open) => !open && setEditProvider(null)}>
        <DialogContent className="max-w-md bg-card border-border/50">
          <DialogHeader>
            <DialogTitle>Editar Provedor</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6 pt-4">
              {renderFormFields(editForm)}
              <DialogFooter className="gap-2 sm:gap-0 border-t border-border/50 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => testConnection(editForm.getValues())}
                  disabled={testLoading}
                >
                  {testLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}{' '}
                  Testar
                </Button>
                <Button type="submit" disabled={isSubmitLoading}>
                  {isSubmitLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar
                  Alterações
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteProvider}
        onOpenChange={(open) => !open && setDeleteProvider(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Provedor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o provedor{' '}
              <strong>{deleteProvider?.provider_name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
