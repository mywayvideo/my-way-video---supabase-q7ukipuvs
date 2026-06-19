import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Loader2, Save, Trash2, Plus, ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

const formSchema = z.object({
  // ai_settings
  cache_expiration_days: z.coerce.number().min(0).optional(),
  price_threshold_usd: z.coerce.number().min(0),

  // cache_settings
  mi_expiration_days: z.coerce.number().min(0).max(10000).default(365),
  product_search_cache_expiration_days: z.coerce.number().min(0).max(10000).default(30),
  search_algorithm_sql: z.string().optional(),
  result_component_config: z.string().optional(),
  ignore_stock_count: z.boolean(),
  logistics_rules_prompt: z.string().optional(),
  system_prompt_template: z.string().optional(),

  // ai_agent_settings
  whatsapp_trigger_low_confidence: z.boolean(),
  whatsapp_trigger_purchase_keywords: z.boolean(),
  whatsapp_trigger_project_keywords: z.boolean(),
  whatsapp_trigger_expensive_product: z.boolean(),
  whatsapp_trigger_keywords: z.string().optional(),
  system_prompt: z.string().optional(),
  confidence_threshold_for_whatsapp: z.string().optional(),
  max_web_search_attempts: z.coerce.number().min(0),

  // New fields
  intent_mapping: z
    .array(
      z.object({
        trigger: z.string().min(1, 'Campo obrigatório'),
        expansion: z.string().min(1, 'Campo obrigatório'),
      }),
    )
    .default([]),
  technical_bridge: z
    .array(
      z.object({
        source: z.string().min(1, 'Campo obrigatório'),
        target: z.string().min(1, 'Campo obrigatório'),
        bridge: z.string().min(1, 'Campo obrigatório'),
      }),
    )
    .default([]),
  custom_stop_words: z.string().optional(),
  proactivity_level: z.coerce.number().min(1).max(10).default(5),
  product_page_prompt: z.string().optional(),
  transparency_note: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export default function AdminAISettings() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [aiSettingsId, setAiSettingsId] = useState<string | null>(null)
  const [aiAgentSettingsId, setAiAgentSettingsId] = useState<string | null>(null)
  const [cacheSettingsId, setCacheSettingsId] = useState<string | null>(null)

  const navigate = useNavigate()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cache_expiration_days: 30,
      price_threshold_usd: 5000,
      mi_expiration_days: 365,
      product_search_cache_expiration_days: 30,
      search_algorithm_sql: '',
      result_component_config: '{}',
      ignore_stock_count: true,
      logistics_rules_prompt: '',
      system_prompt_template: '',
      whatsapp_trigger_low_confidence: true,
      whatsapp_trigger_purchase_keywords: true,
      whatsapp_trigger_project_keywords: true,
      whatsapp_trigger_expensive_product: true,
      whatsapp_trigger_keywords: 'comprar, orçamento, quanto custa, disponível, preço',
      system_prompt: '',
      confidence_threshold_for_whatsapp: 'low',
      max_web_search_attempts: 2,
      intent_mapping: [],
      technical_bridge: [],
      custom_stop_words: '',
      proactivity_level: 5,
      product_page_prompt: '',
      transparency_note: '',
    },
  })

  const {
    fields: intentFields,
    append: appendIntent,
    remove: removeIntent,
  } = useFieldArray({
    name: 'intent_mapping',
    control: form.control,
  })

  const {
    fields: bridgeFields,
    append: appendBridge,
    remove: removeBridge,
  } = useFieldArray({
    name: 'technical_bridge',
    control: form.control,
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [
          { data: aiSettingsData, error: aiSettingsError },
          { data: aiAgentSettingsData, error: aiAgentSettingsError },
          { data: transparencyData },
          { data: cacheSettingsData, error: cacheSettingsError },
        ] = await Promise.all([
          supabase
            .from('ai_settings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single(),
          supabase
            .from('ai_agent_settings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single(),
          supabase.from('settings').select('value').eq('key', 'transparency_note').maybeSingle(),
          supabase.from('cache_settings').select('*').limit(1).maybeSingle(),
        ])

        if (aiSettingsError) throw aiSettingsError
        if (aiAgentSettingsError) throw aiAgentSettingsError
        if (cacheSettingsError) console.error(cacheSettingsError)

        if (aiSettingsData) {
          setAiSettingsId(aiSettingsData.id)
        }
        if (aiAgentSettingsData) {
          setAiAgentSettingsId(aiAgentSettingsData.id)
        }
        if (cacheSettingsData) {
          setCacheSettingsId(cacheSettingsData.id)
        }

        form.reset({
          cache_expiration_days: aiSettingsData?.cache_expiration_days ?? 30,
          mi_expiration_days: cacheSettingsData?.mi_expiration_days ?? 365,
          product_search_cache_expiration_days:
            cacheSettingsData?.product_search_cache_expiration_days ?? 30,
          price_threshold_usd: aiSettingsData?.price_threshold_usd ?? 5000,
          search_algorithm_sql: aiSettingsData?.search_algorithm_sql || '',
          result_component_config:
            typeof aiSettingsData?.result_component_config === 'string'
              ? aiSettingsData.result_component_config
              : JSON.stringify(aiSettingsData?.result_component_config || {}, null, 2),
          ignore_stock_count: aiSettingsData?.ignore_stock_count ?? true,
          logistics_rules_prompt: aiSettingsData?.logistics_rules_prompt || '',
          system_prompt_template:
            aiSettingsData?.system_prompt_template ||
            'Identidade: Consultor Técnico e de Vendas Sênior da My Way Business.\nModo de Vendas: Se um produto ou SKU for mencionado, ative o Modo de Vendas imediatamente. Seja persuasivo e técnico.\n\nREGRAS OBRIGATÓRIAS DE FORMATO:\n1. Sua resposta DEVE ser sempre um objeto JSON válido.\n2. Use a chave "referenced_internal_products" para listar um array contendo APENAS os IDs (UUIDs) dos produtos encontrados e recomendados.\n3. Use a chave "content" para o texto da sua resposta.\n4. É IMPRESCINDÍVEL incluir os IDs de TODOS os produtos mencionados na conversa para que os cards sejam exibidos corretamente na tela.\n\nBriefing Técnico: Detalhe sensor, latitude, codecs e ergonomia para cada produto.\nGatilhos Visuais: Force a exibição dos cards de produtos sempre que houver uma correspondência no inventário, retornando seus respectivos IDs.',

          whatsapp_trigger_low_confidence:
            aiAgentSettingsData?.whatsapp_trigger_low_confidence ?? true,
          whatsapp_trigger_purchase_keywords:
            aiAgentSettingsData?.whatsapp_trigger_purchase_keywords ?? true,
          whatsapp_trigger_project_keywords:
            aiAgentSettingsData?.whatsapp_trigger_project_keywords ?? true,
          whatsapp_trigger_expensive_product:
            aiAgentSettingsData?.whatsapp_trigger_expensive_product ?? true,
          whatsapp_trigger_keywords:
            aiAgentSettingsData?.whatsapp_trigger_keywords?.join(', ') ||
            'comprar, orçamento, quanto custa, disponível, preço',
          system_prompt:
            aiAgentSettingsData?.system_prompt ||
            'Você é o consultor técnico sênior da My Way, especialista em equipamentos audiovisuais.\n\nREGRA DE IDIOMA: Detecte o idioma utilizado pelo usuário e responda obrigatoriamente no mesmo idioma.\n\nREGRAS OBRIGATÓRIAS DE FORMATO:\nSua resposta DEVE ser sempre um objeto JSON válido. Use a chave "referenced_internal_products" para listar um array contendo APENAS OS IDs (UUIDs) dos produtos encontrados no inventário. Use a chave "content" para o texto da sua resposta em Markdown.\nÉ IMPRESCINDÍVEL incluir os IDs na chave "referenced_internal_products" para que os cards sejam exibidos corretamente na tela.',
          confidence_threshold_for_whatsapp:
            aiAgentSettingsData?.confidence_threshold_for_whatsapp || 'low',
          max_web_search_attempts: aiAgentSettingsData?.max_web_search_attempts ?? 2,

          intent_mapping: Array.isArray(aiSettingsData?.intent_mapping)
            ? aiSettingsData.intent_mapping.map((item: any) => ({
                trigger: item.trigger || '',
                expansion: item.expansion || item.expansions || '',
              }))
            : [],
          technical_bridge: Array.isArray(aiSettingsData?.technical_bridge)
            ? aiSettingsData.technical_bridge
            : [],
          custom_stop_words: aiSettingsData?.custom_stop_words || '',
          proactivity_level: aiAgentSettingsData?.proactivity_level ?? 5,
          product_page_prompt: aiSettingsData?.product_page_prompt || '',
          transparency_note: transparencyData?.value || '',
        })
      } catch (error: any) {
        toast({
          title: 'Erro ao carregar',
          description: error.message,
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [form, toast])

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true)
    try {
      let parsedComponentConfig = {}
      if (values.result_component_config) {
        try {
          parsedComponentConfig = JSON.parse(values.result_component_config)
        } catch (e) {
          throw new Error('O JSON de Configuração de Exibição é inválido.')
        }
      }

      const keywordsArray = values.whatsapp_trigger_keywords
        ? values.whatsapp_trigger_keywords
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k)
        : []

      const aiSettingsPayload: any = {
        cache_expiration_days: values.cache_expiration_days,
        price_threshold_usd: values.price_threshold_usd,
        search_algorithm_sql: values.search_algorithm_sql,
        result_component_config: parsedComponentConfig,
        ignore_stock_count: values.ignore_stock_count,
        logistics_rules_prompt: values.logistics_rules_prompt,
        system_prompt_template: values.system_prompt_template,
        intent_mapping: values.intent_mapping,
        technical_bridge: values.technical_bridge,
        custom_stop_words: values.custom_stop_words,
        product_page_prompt: values.product_page_prompt,
        updated_at: new Date().toISOString(),
      }

      const aiAgentSettingsPayload: any = {
        whatsapp_trigger_low_confidence: values.whatsapp_trigger_low_confidence,
        whatsapp_trigger_purchase_keywords: values.whatsapp_trigger_purchase_keywords,
        whatsapp_trigger_project_keywords: values.whatsapp_trigger_project_keywords,
        whatsapp_trigger_expensive_product: values.whatsapp_trigger_expensive_product,
        whatsapp_trigger_keywords: keywordsArray,
        system_prompt: values.system_prompt || '',
        confidence_threshold_for_whatsapp: values.confidence_threshold_for_whatsapp,
        max_web_search_attempts: values.max_web_search_attempts,
        proactivity_level: values.proactivity_level,
        updated_at: new Date().toISOString(),
      }

      if (!aiSettingsId || !aiAgentSettingsId) {
        throw new Error('IDs de configuração não encontrados. Recarregue a página.')
      }

      const [res1, res2, res3, res4] = await Promise.all([
        supabase
          .from('ai_settings')
          .update(aiSettingsPayload)
          .eq('id', aiSettingsId)
          .select()
          .single(),
        supabase
          .from('ai_agent_settings')
          .update(aiAgentSettingsPayload)
          .eq('id', aiAgentSettingsId)
          .select()
          .single(),
        supabase
          .from('settings')
          .upsert(
            { key: 'transparency_note', value: values.transparency_note || '' },
            { onConflict: 'key' },
          ),
        supabase.functions.invoke('update-cache-settings', {
          body: {
            id: cacheSettingsId || '00000000-0000-0000-0000-000000000001',
            mi_expiration_days: values.mi_expiration_days,
            product_search_cache_expiration_days: values.product_search_cache_expiration_days,
          },
        }),
      ])

      if (res1.error) throw res1.error
      if (res2.error) throw res2.error
      if (res3.error) throw res3.error
      if (res4.error)
        throw new Error(res4.error.message || 'Erro ao atualizar cache_settings via service_role')

      toast({
        title: 'Sucesso',
        description: 'Configurações salvas com sucesso!',
      })
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar configurações.',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-4xl space-y-8">
        <Skeleton className="h-12 w-[400px]" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Configurações da Inteligência Artificial
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie o comportamento, limites e prompts do agente de IA. (Layout Permanente
            Secional)
          </p>
        </div>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Seção A & B */}
          <Card>
            <CardHeader>
              <CardTitle>Seção A & B (Configurações de Cache e Limites)</CardTitle>
              <CardDescription>
                Define o tempo de vida do cache para respostas da IA e o limite de preço (USD) para
                filtragem de produtos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price_threshold_usd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Limite de Preço (USD)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="mi_expiration_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Validade do Market Intelligence (dias)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          placeholder="Ex: 365"
                          title="Número de dias até expiração automática das entradas de Market Intelligence."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="product_search_cache_expiration_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Validade do Product Search Cache (dias)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          placeholder="Ex: 30"
                          title="Número de dias até expiração automática das entradas do Product Search Cache."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Seção C */}
          <Card>
            <CardHeader>
              <CardTitle>Seção C (Gatilhos do WhatsApp)</CardTitle>
              <CardDescription>
                Alternadores (switches) para controle de comportamento baseado em confiança e
                palavras-chave.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="whatsapp_trigger_low_confidence"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Baixa Confiança</FormLabel>
                        <FormDescription>
                          Acionar especialista quando a confiança for baixa
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="whatsapp_trigger_purchase_keywords"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Intenção de Compra</FormLabel>
                        <FormDescription>
                          Acionar especialista em palavras de compra
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="whatsapp_trigger_project_keywords"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Projetos Complexos</FormLabel>
                        <FormDescription>
                          Acionar especialista para palavras de projeto
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="whatsapp_trigger_expensive_product"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Produto de Alto Valor</FormLabel>
                        <FormDescription>
                          Acionar se o preço passar do limite definido
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="whatsapp_trigger_keywords"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Palavras-chave de Acionamento (separadas por vírgula)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="confidence_threshold_for_whatsapp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Limiar de Confiança</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ex: low" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="max_web_search_attempts"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tentativas de Busca Web</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Seção D */}
          <Card>
            <CardHeader>
              <CardTitle>Seção D (Algoritmo SQL)</CardTitle>
              <CardDescription>
                Editor do SQL bruto para busca de produtos. O sistema executará exatamente o que
                estiver aqui.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="search_algorithm_sql"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="font-mono text-sm min-h-[150px]"
                        placeholder="Ex: ORDER BY price_usa DESC, stock DESC"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Seção E */}
          <Card>
            <CardHeader>
              <CardTitle>Seção E (AI Expert Prompt)</CardTitle>
              <CardDescription>
                Define a "personalidade" e as regras da IA. Injetado como a System Message
                principal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="system_prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função Principal (System Prompt)</FormLabel>
                    <FormDescription>
                      Define a "persona" do agente e seu objetivo central de negócio. Use para
                      configurar o tom de voz e como ele aborda as vendas e consultorias técnicas.
                    </FormDescription>
                    <FormControl>
                      <Textarea {...field} className="font-mono text-sm min-h-[250px]" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="system_prompt_template"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Regras Estritas e Gatilhos Visuais (System Prompt Template)
                    </FormLabel>
                    <FormDescription>
                      Define as "hard rules" que o modelo não pode ignorar.{' '}
                      <strong>Instruções críticas para garantir que os cards apareçam:</strong>{' '}
                      Exija expressamente que o modelo retorne os IDs no JSON
                      ('referenced_internal_products') e oriente-o a cruzar apelidos/siglas curtas
                      (como '7M4' ou 'Pyxis') com os SKUs oficiais do inventário.
                    </FormDescription>
                    <FormControl>
                      <Textarea {...field} className="font-mono text-sm min-h-[250px]" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Seção F */}
          <Card>
            <CardHeader>
              <CardTitle>Seção F (Configuração de Exibição)</CardTitle>
              <CardDescription>Editor JSON para definir colunas (desktop/mobile).</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="result_component_config"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="font-mono text-sm min-h-[150px]"
                        placeholder={'{\n  "desktop_columns": 4,\n  "mobile_columns": 2\n}'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Seção G */}
          <Card>
            <CardHeader>
              <CardTitle>Seção G (Estoque e Logística)</CardTitle>
              <CardDescription>Regras de entrega/origem e toggle de estoque.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="ignore_stock_count"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Ignorar Contagem de Estoque</FormLabel>
                      <FormDescription>
                        Se ativado, a busca SQL não incluirá 'AND stock &gt; 0'
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="logistics_rules_prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prompt de Regras Logísticas</FormLabel>
                    <FormControl>
                      <Textarea {...field} className="font-mono text-sm min-h-[150px]" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Seção H */}
          <Card>
            <CardHeader>
              <CardTitle>Seção H (Mapeamento Semântico de Intenção)</CardTitle>
              <CardDescription>
                Defina palavras-chave que acionam termos de busca adicionais para melhorar os
                resultados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {intentFields.length === 0 ? (
                <div className="text-center p-6 border rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-4">
                    Nenhum mapeamento configurado.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => appendIntent({ trigger: '', expansion: '' })}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Mapeamento
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {intentFields.map((field, index) => (
                    <div key={field.id} className="flex gap-4 items-start">
                      <FormField
                        control={form.control}
                        name={`intent_mapping.${index}.trigger`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="sr-only">Termo Gatilho</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Termo Gatilho (ex: Produção)" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`intent_mapping.${index}.expansion`}
                        render={({ field }) => (
                          <FormItem className="flex-[2]">
                            <FormLabel className="sr-only">Palavras-chave de Expansão</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Palavras de Expansão (ex: Câmera, Lente, Tripé)"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeIntent(index)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => appendIntent({ trigger: '', expansion: '' })}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Mapeamento
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seção I */}
          <Card>
            <CardHeader>
              <CardTitle>Seção I (Ponte de Soluções Técnicas)</CardTitle>
              <CardDescription>
                Defina regras para dependências técnicas (ex: conversão HDMI para SDI).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {bridgeFields.length === 0 ? (
                <div className="text-center p-6 border rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-4">
                    Nenhuma ponte técnica configurada.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => appendBridge({ source: '', target: '', bridge: '' })}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Regra
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {bridgeFields.map((field, index) => (
                    <div key={field.id} className="flex gap-4 items-start">
                      <FormField
                        control={form.control}
                        name={`technical_bridge.${index}.source`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="sr-only">Protocolo Origem</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Origem (ex: HDMI)" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`technical_bridge.${index}.target`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="sr-only">Protocolo Destino</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Destino (ex: SDI)" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`technical_bridge.${index}.bridge`}
                        render={({ field }) => (
                          <FormItem className="flex-[2]">
                            <FormLabel className="sr-only">Solução (Ponte)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Ponte (ex: Micro Converter BiDirectional)"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBridge(index)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => appendBridge({ source: '', target: '', bridge: '' })}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Regra
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seção J */}
          <Card>
            <CardHeader>
              <CardTitle>Seção J (Comportamento e Vocabulário)</CardTitle>
              <CardDescription>
                Ajuste a proatividade do agente e configurações de filtro de palavras.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <FormField
                control={form.control}
                name="proactivity_level"
                render={({ field: { value, onChange } }) => (
                  <FormItem>
                    <FormLabel>Nível de Proatividade (1 a 10)</FormLabel>
                    <FormDescription>
                      1 (Passivo/Reativo) a 10 (Consultor Ativo/Vendedor)
                    </FormDescription>
                    <FormControl>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium">1</span>
                        <Slider
                          min={1}
                          max={10}
                          step={1}
                          value={[value]}
                          onValueChange={(vals) => onChange(vals[0])}
                          className="flex-1"
                        />
                        <span className="text-sm font-medium">10</span>
                        <span className="text-sm font-bold ml-4 w-6 text-center">{value}</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="custom_stop_words"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Palavras Ignoradas (Stop Words Customizadas)</FormLabel>
                    <FormDescription>
                      Palavras a serem ignoradas pelo motor de busca (separadas por vírgula).
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="font-mono text-sm min-h-[100px]"
                        placeholder="Palavras a ignorar..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Seção K */}
          <Card>
            <CardHeader>
              <CardTitle>Seção K (Prompt da Página de Produto)</CardTitle>
              <CardDescription>
                Define as instruções específicas quando o usuário está interagindo a partir da
                página de um produto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="product_page_prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instruções Complementares</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="font-mono text-sm min-h-[150px]"
                        placeholder="Ex: Foque nos diferenciais deste produto e sugira acessórios compatíveis..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Seção L */}
          <Card>
            <CardHeader>
              <CardTitle>Seção L (Nota de Transparência)</CardTitle>
              <CardDescription>
                Texto anexado automaticamente ao final de todas as respostas da IA.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="transparency_note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nota de Transparência</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="font-mono text-sm min-h-[150px]"
                        placeholder="Ex: Os preços e a disponibilidade de estoque são baseados nas condições atuais e podem sofrer alterações..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" onClick={form.handleSubmit(onSubmit)} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Save className="mr-2 h-5 w-5" />
              )}
              Salvar Configurações
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
