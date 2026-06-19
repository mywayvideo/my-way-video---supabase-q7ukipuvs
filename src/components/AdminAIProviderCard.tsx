import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { Database } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarClock,
  ShieldAlert,
} from 'lucide-react'

type AIProvider = Database['public']['Tables']['ai_providers']['Row']

interface Props {
  provider: AIProvider
  allProviders: AIProvider[]
  onRefresh: () => void
}

export function AdminAIProviderCard({ provider, allProviders, onRefresh }: Props) {
  const [formData, setFormData] = useState({
    api_key_secret_name: provider.api_key_secret_name,
    is_active: provider.is_active,
    priority_order: provider.priority_order || 999,
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [accordionVal, setAccordionVal] = useState('')

  useEffect(() => {
    setFormData({
      api_key_secret_name: provider.api_key_secret_name,
      is_active: provider.is_active,
      priority_order: provider.priority_order || 999,
    })
  }, [provider])

  const handleSave = async () => {
    if (formData.is_active) {
      const conflict = allProviders.find(
        (p) => p.id !== provider.id && p.is_active && p.priority_order === formData.priority_order,
      )
      if (conflict) {
        setErrorMsg('Prioridade já em uso')
        return
      }
    }
    setErrorMsg('')
    setSaving(true)
    const { error } = await supabase
      .from('ai_providers')
      .update({
        api_key_secret_name: formData.api_key_secret_name,
        is_active: formData.is_active,
        priority_order: formData.priority_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', provider.id)

    setSaving(false)
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    else {
      toast({ title: 'Sucesso', description: 'Provedor atualizado com sucesso!' })
      setAccordionVal('')
      onRefresh()
    }
  }

  const handleTest = async () => {
    setTesting(true)
    const { data, error } = await supabase.functions.invoke('validate-ai-provider', {
      body: { provider_name: provider.provider_name },
    })
    setTesting(false)
    if (error || data?.status === 'invalid' || !data?.success)
      toast({
        title: 'Erro na Validação',
        description: data?.error_message || data?.error || error?.message || 'Erro desconhecido',
        variant: 'destructive',
      })
    else toast({ title: 'Sucesso', description: data?.message || 'Conexão validada com sucesso!' })
    onRefresh()
  }

  const handleCancel = () => {
    setFormData({
      api_key_secret_name: provider.api_key_secret_name,
      is_active: provider.is_active,
      priority_order: provider.priority_order || 999,
    })
    setErrorMsg('')
    setAccordionVal('')
  }

  const renderValidation = (status: string | null) => {
    switch (status) {
      case 'valid':
        return (
          <span className="flex items-center text-green-500 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 mr-1" /> Válido
          </span>
        )
      case 'invalid':
      case 'error':
        return (
          <span className="flex items-center text-red-500 text-sm font-medium">
            <XCircle className="w-4 h-4 mr-1" /> Inválido
          </span>
        )
      default:
        return (
          <span className="flex items-center text-yellow-500 text-sm font-medium">
            <AlertCircle className="w-4 h-4 mr-1" /> Pendente
          </span>
        )
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca validado'
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(dateStr),
    )
  }

  return (
    <Card
      className={`flex flex-col relative overflow-hidden transition-all duration-300 ${provider.is_active ? 'border-primary/40 shadow-md' : 'border-border/50 opacity-80'}`}
    >
      <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl capitalize flex items-center gap-2">
              {provider.provider_name}
              {provider.is_active && provider.priority_order === 1 && (
                <Badge
                  variant="default"
                  className="text-[10px] h-5 px-1.5 bg-accent text-accent-foreground"
                >
                  Primário
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="font-mono mt-1">{provider.model_id}</CardDescription>
          </div>
          <Badge
            variant={provider.is_active ? 'default' : 'secondary'}
            className={
              provider.is_active ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : ''
            }
          >
            {provider.is_active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
              Status de Validação
            </span>
            {testing ? (
              <span className="flex items-center text-primary text-sm font-medium">
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Testando
              </span>
            ) : (
              renderValidation(provider.validation_status)
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
              Último Teste
            </span>
            <span className="flex items-center text-xs font-mono text-muted-foreground">
              <CalendarClock className="w-3 h-3 mr-1" />
              {formatDate(provider.last_validated_at)}
            </span>
          </div>
        </div>

        <Accordion
          type="single"
          collapsible
          value={accordionVal}
          onValueChange={setAccordionVal}
          className="mt-auto border-t-0"
        >
          <AccordionItem value="edit" className="border-b-0">
            <AccordionTrigger className="hover:no-underline py-2 text-primary text-sm font-semibold">
              Editar Configurações
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-4 border-t border-border/50">
                <div className="space-y-2">
                  <Label>Nome do Secret (API Key)</Label>
                  <Input
                    value={formData.api_key_secret_name}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, api_key_secret_name: e.target.value }))
                      setErrorMsg('')
                    }}
                    className="bg-background/50 font-mono text-xs"
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
                  <div>
                    <Label>Usar esta IA</Label>
                    <p className="text-[10px] text-muted-foreground">Ativar provedor no sistema</p>
                  </div>
                  <Switch
                    checked={formData.is_active || false}
                    onCheckedChange={(c) => {
                      setFormData((p) => ({ ...p, is_active: c }))
                      setErrorMsg('')
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prioridade (1 = Mais alta)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={formData.priority_order}
                    disabled={!formData.is_active}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, priority_order: parseInt(e.target.value) || 1 }))
                      setErrorMsg('')
                    }}
                    className="bg-background/50 w-24"
                  />
                  {errorMsg && (
                    <p className="text-xs text-destructive mt-1 font-medium flex items-center">
                      <ShieldAlert className="w-3 h-3 mr-1" /> {errorMsg}
                    </p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-border/50 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={testing || saving}
                    className="sm:mr-auto h-9"
                  >
                    <AlertCircle className="w-3 h-3 mr-2" />
                    Testar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={testing || saving}
                    className="h-9"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={testing || saving}
                    className="h-9"
                  >
                    {saving ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}Salvar
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
