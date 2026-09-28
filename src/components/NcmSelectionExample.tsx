import React, { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Scale,
  Clock,
  Cpu,
  ShieldCheck,
  Check,
  Info,
  BookOpen,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

/**
 * ============================================================================================
 * GUIA DE INTEGRAÇÃO RÁPIDA (PARA A EQUIPE DO OUTRO APLICATIVO ADMINISTRATIVO):
 * ============================================================================================
 *
 * 1. ONDE CHAMAR A EDGE FUNCTION:
 *    - Chame a função `classify-ncm` via Supabase Client:
 *      ```ts
 *      const { data, error } = await supabase.functions.invoke('classify-ncm', {
 *        body: {
 *          product_description: "Descrição completa do produto...",
 *          brand: "Marca (opcional)",
 *          model: "Modelo (opcional)",
 *          additional_specs: "Especificações adicionais (opcional)",
 *          top_n: 15,
 *          product_id: "uuid-do-produto-no-seu-modulo", // opcional
 *          save_log: true
 *        }
 *      })
 *      ```
 *    - Passe o objeto retornado `data` diretamente para a prop `data` deste componente (`<NcmSelectionExample data={data} />`).
 *
 * 2. ONDE GRAVAR A ESCOLHA CONFIRMADA:
 *    - Quando o usuário clica em "Confirmar NCM Selecionado", o callback `onConfirm(selection)` é disparado.
 *    - Atualize a linha do seu produto e opcionalmente persista a decisão na tabela de auditoria:
 *      ```ts
 *      await supabase.from('imp_sim_ncm_classification_log').update({
 *        final_choice_ncm: selection.ncm,
 *        final_choice_ex: selection.ex || '',
 *        status: 'aceito',
 *        confirmed_by: user.id
 *      }).eq('id', data.audit_id)
 *      ```
 *
 * 3. ONDE PLUGAR O `product_id` DO SEU MÓDULO:
 *    - Envie `product_id` ou `imp_sim_product_id` no body de invocação da edge function, ou passe via prop `productId`
 *      para vincular o salvamento local ao cadastro do simulador/produtos.
 * ============================================================================================
 */

/** Formata código NCM para o padrão aduaneiro legível: XXXX.XX.XX (ex.: 8529.90.90) */
export function formatNcmCode(code: string | null | undefined): string {
  if (!code) return '—'
  const digits = String(code).replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  return code
}

/** Formata alíquota para porcentagem com vírgula decimal pt-BR (ex.: 6,5% ou 16,0%) */
export function formatTaxPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '0,0%'
  return (
    Number(value).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }) + '%'
  )
}

export type ConfidenceLevel = 'alta' | 'media' | 'baixa' | string

export interface TaxRatesBlock {
  ii: number
  ipi: number
  pis: number
  cofins: number
  total_tax: number
}

export interface NcmOptionItem extends TaxRatesBlock {
  ncm: string
  ex?: string
  description?: string
  has_ex_tarifario?: boolean
  justification?: string
  reason?: string
  alternatives_source?: string
  legal_basis?: any
  ex_details?: {
    descricao?: string | null
    resolucao?: string | null
    data_fim?: string | null
  } | null
}

export interface NcmSelectionData {
  success?: boolean
  audit_id?: string | null
  version?: string
  analyst_model?: string
  auditor_model?: string
  model_used?: string
  execution_time_ms?: number
  candidates_count?: number
  confidence?: ConfidenceLevel
  sufficient_info?: boolean
  product_understanding?: {
    identity?: string
    product_nature?: string
    essential_function?: string
    technical_features?: string[]
    target_machines?: string[]
    canonical_statement?: string
    coherent_with_description?: boolean
  }
  recommendation: NcmOptionItem
  alternatives?: NcmOptionItem[]
  web_sources?: Array<{
    title: string
    url: string
    snippet?: string
  }>
}

export interface NcmSelectionConfirmedPayload {
  ncm: string
  ex: string
  isRecommended: boolean
  auditId: string | null
  item: NcmOptionItem
}

export interface NcmSelectionExampleProps {
  /** Objeto de resposta retornado pela edge function classify-ncm */
  data: NcmSelectionData
  /** ID do produto no módulo administrativo receptor (opcional) */
  productId?: string
  /** Callback acionado ao confirmar a seleção de NCM */
  onConfirm?: (selection: NcmSelectionConfirmedPayload) => void
  /** Permite desativar botões de ação caso esteja apenas em modo leitura */
  readOnly?: boolean
}

export function NcmSelectionExample({
  data,
  productId,
  onConfirm,
  readOnly = false,
}: NcmSelectionExampleProps) {
  const { toast } = useToast()

  // Controla qual item está selecionado pelo rádio: 'recommended' ou 'alt-INDEX'
  const [selectedKey, setSelectedKey] = useState<string>('recommended')
  // Controla o colapso da justificativa legal do recomendado
  const [isRecJustificationOpen, setIsRecJustificationOpen] = useState(true)
  // Controla o colapso da justificativa da alternativa selecionada
  const [isAltJustificationOpen, setIsAltJustificationOpen] = useState(true)
  // Feedback visual de confirmação
  const [isConfirmed, setIsConfirmed] = useState(false)

  const rec = data?.recommendation
  const alternatives = data?.alternatives || []

  // Resolve qual item está atualmente ativo
  const getActiveSelection = (): { item: NcmOptionItem; isRecommended: boolean } => {
    if (selectedKey === 'recommended' || !selectedKey.startsWith('alt-')) {
      return { item: rec, isRecommended: true }
    }
    const idx = parseInt(selectedKey.replace('alt-', ''), 10)
    const altItem = alternatives[idx] || rec
    return { item: altItem, isRecommended: false }
  }

  const active = getActiveSelection()

  const handleConfirm = () => {
    const payload: NcmSelectionConfirmedPayload = {
      ncm: active.item.ncm,
      ex: active.item.ex || '',
      isRecommended: active.isRecommended,
      auditId: data.audit_id || null,
      item: active.item,
    }

    // 1. Notifica callback externo para salvar no banco/formulário do app
    if (onConfirm) {
      onConfirm(payload)
    }

    // 2. Feedback visual via Toast
    setIsConfirmed(true)
    toast({
      title: 'NCM Confirmado com Sucesso!',
      description: `Classificação ${formatNcmCode(payload.ncm)}${
        payload.ex ? ` (Ex ${payload.ex})` : ''
      } definida para o produto${productId ? ` (ID: ${productId.slice(0, 8)}...)` : ''}.`,
    })

    console.log('[NcmSelectionExample] NCM Confirmado:', payload)
  }

  const renderConfidenceBadge = (confidence?: ConfidenceLevel) => {
    const conf = confidence?.toLowerCase()
    if (conf === 'alta') {
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-medium text-xs flex items-center gap-1 shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5" />
          Confiança Alta
        </Badge>
      )
    }
    if (conf === 'media' || conf === 'média') {
      return (
        <Badge className="bg-amber-600 hover:bg-amber-700 text-white border-0 font-medium text-xs flex items-center gap-1 shadow-sm">
          <AlertTriangle className="w-3.5 h-3.5" />
          Confiança Média
        </Badge>
      )
    }
    if (conf === 'baixa') {
      return (
        <Badge className="bg-rose-600 hover:bg-rose-700 text-white border-0 font-medium text-xs flex items-center gap-1 shadow-sm">
          <AlertTriangle className="w-3.5 h-3.5" />
          Confiança Baixa
        </Badge>
      )
    }
    return null
  }

  const renderSourceBadge = (source?: string) => {
    if (!source) return null
    const lower = source.toLowerCase()

    if (lower.includes('promovido') || lower.includes('varredura')) {
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-normal border-purple-500/40 text-purple-700 dark:text-purple-300 bg-purple-500/10 flex items-center gap-1"
          title="Item recuperado via varredura profunda de candidatos após rebaixamento ou precedência"
        >
          <Layers className="w-3 h-3 text-purple-500" />
          Promovido da varredura de candidatos
        </Badge>
      )
    }

    if (lower.includes('citado') || lower.includes('ia') || lower.includes('llm')) {
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-normal border-blue-500/40 text-blue-700 dark:text-blue-300 bg-blue-500/10 flex items-center gap-1"
          title="Alternativa apontada pelo modelo de IA na análise técnica"
        >
          <Sparkles className="w-3 h-3 text-blue-500" />
          Citado pela IA
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
        Fonte: {source}
      </Badge>
    )
  }

  return (
    <div className="w-full space-y-6 text-foreground font-sans">
      {/* 1. Alerta de Informações Insuficientes (se sufficient_info: false) */}
      {data.sufficient_info === false && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="font-semibold text-sm">
            Informações de Produto Insuficientes
          </AlertTitle>
          <AlertDescription className="text-xs mt-1 leading-relaxed">
            A descrição fornecida carece de especificações técnicas essenciais (ex.: princípio de
            funcionamento, se possui alimentação própria, se opera de forma autônoma ou se é
            acessório dedicado a outro equipamento). A IA fez uma estimativa preliminar, mas
            recomenda-se detalhar o produto para uma classificação 100% segura.
          </AlertDescription>
        </Alert>
      )}

      {/* 2. Card Principal: NCM Recomendado */}
      <Card
        className={`border-2 transition-all shadow-sm ${
          selectedKey === 'recommended'
            ? 'border-amber-500/80 bg-amber-500/[0.02] ring-1 ring-amber-500/20'
            : 'border-border/60 hover:border-amber-500/40'
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  NCM Recomendado
                </span>
                {renderConfidenceBadge(data.confidence)}
                {rec?.alternatives_source && renderSourceBadge(rec.alternatives_source)}
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <CardTitle className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-foreground">
                  {formatNcmCode(rec?.ncm)}
                </CardTitle>
                {rec?.ex && (
                  <Badge
                    variant="outline"
                    className="font-mono text-xs border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                  >
                    Ex {rec.ex}
                  </Badge>
                )}
              </div>
              {rec?.description && (
                <CardDescription className="text-xs sm:text-sm text-foreground/80 leading-relaxed font-medium pt-1">
                  {rec.description}
                </CardDescription>
              )}
            </div>

            {/* Seleção via Radio */}
            <div className="flex items-center gap-2 self-start sm:self-center bg-muted/40 p-2 rounded-lg border">
              <RadioGroup value={selectedKey} onValueChange={setSelectedKey}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="recommended" id="radio-recommended" />
                  <Label
                    htmlFor="radio-recommended"
                    className="text-xs font-semibold cursor-pointer"
                  >
                    Selecionar este
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Grade de Alíquotas */}
          <div className="p-3.5 bg-muted/30 dark:bg-muted/15 rounded-lg border border-border/60">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-primary" />
                Carga Tributária de Importação
              </span>
              <span className="text-[10px] lowercase text-muted-foreground font-mono">
                base imp_sim_tax_rates_effective
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              <div className="bg-background/80 p-2 rounded border">
                <div className="text-[10px] text-muted-foreground font-medium">II</div>
                <div className="text-sm font-mono font-bold text-foreground">
                  {formatTaxPercent(rec?.ii)}
                </div>
              </div>
              <div className="bg-background/80 p-2 rounded border">
                <div className="text-[10px] text-muted-foreground font-medium">IPI</div>
                <div className="text-sm font-mono font-bold text-foreground">
                  {formatTaxPercent(rec?.ipi)}
                </div>
              </div>
              <div className="bg-background/80 p-2 rounded border">
                <div className="text-[10px] text-muted-foreground font-medium">PIS</div>
                <div className="text-sm font-mono font-bold text-foreground">
                  {formatTaxPercent(rec?.pis)}
                </div>
              </div>
              <div className="bg-background/80 p-2 rounded border">
                <div className="text-[10px] text-muted-foreground font-medium">COFINS</div>
                <div className="text-sm font-mono font-bold text-foreground">
                  {formatTaxPercent(rec?.cofins)}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-amber-500/10 border border-amber-500/30 p-2 rounded">
                <div className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold uppercase">
                  Total Tributos
                </div>
                <div className="text-sm font-mono font-black text-amber-600 dark:text-amber-400">
                  {formatTaxPercent(rec?.total_tax)}
                </div>
              </div>
            </div>
          </div>

          {/* Justificativa Legal (Texto Longo Colapsável) */}
          <Collapsible open={isRecJustificationOpen} onOpenChange={setIsRecJustificationOpen}>
            <div className="border rounded-lg bg-background overflow-hidden">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-3 text-xs font-semibold hover:bg-muted/40 transition-colors text-left"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <BookOpen className="w-4 h-4 text-amber-500" />
                    Fundamentação Legal e Racional Aduaneiro (NESH / RGI)
                  </span>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="text-[11px] font-normal">
                      {isRecJustificationOpen ? 'Ocultar' : 'Expandir justificativa'}
                    </span>
                    {isRecJustificationOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3.5 pb-3.5 pt-1 text-xs text-foreground/85 leading-relaxed border-t bg-muted/10 space-y-2.5">
                <div className="whitespace-pre-line break-words [overflow-wrap:anywhere]">
                  {rec?.justification ||
                    'Nenhuma justificativa detalhada foi fornecida pelo agente.'}
                </div>

                {/* Detalhes do Ex-Tarifário se houver */}
                {rec?.has_ex_tarifario && rec?.ex_details && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs space-y-1">
                    <div className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Condições do Ex-Tarifário {rec.ex}
                    </div>
                    {rec.ex_details.descricao && (
                      <p className="text-foreground/90">{rec.ex_details.descricao}</p>
                    )}
                    {rec.ex_details.resolucao && (
                      <p className="text-[11px] text-muted-foreground">
                        Resolução: {rec.ex_details.resolucao}
                        {rec.ex_details.data_fim ? ` • Vigência: ${rec.ex_details.data_fim}` : ''}
                      </p>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Entendimento do Produto (se retornado pela Fase 0) */}
          {data.product_understanding && (
            <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-xs space-y-1.5">
              <div className="font-semibold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Info className="w-3.5 h-3.5 text-primary" />
                Interpretação Ontológica do Produto
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                {data.product_understanding.product_nature && (
                  <div>
                    <span className="text-muted-foreground font-medium">Natureza: </span>
                    <span className="font-semibold text-foreground">
                      {data.product_understanding.product_nature}
                    </span>
                  </div>
                )}
                {data.product_understanding.target_machines &&
                  data.product_understanding.target_machines.length > 0 && (
                    <div>
                      <span className="text-muted-foreground font-medium">
                        Equipamento(s) de Destino:{' '}
                      </span>
                      <span className="font-semibold text-foreground">
                        {data.product_understanding.target_machines.join(', ')}
                      </span>
                    </div>
                  )}
                {data.product_understanding.essential_function && (
                  <div className="col-span-1 sm:col-span-2">
                    <span className="text-muted-foreground font-medium">Função Essencial: </span>
                    <span className="text-foreground">
                      {data.product_understanding.essential_function}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Lista de Alternativas Hierarquizadas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Layers className="w-4 h-4 text-primary" />
            Classificações Alternativas Avaliadas
            <Badge variant="secondary" className="text-[11px] font-mono ml-1">
              {alternatives.length}
            </Badge>
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Clique em uma opção para selecioná-la
          </span>
        </div>

        {alternatives.length === 0 ? (
          <div className="p-4 border rounded-lg bg-muted/10 text-center text-xs text-muted-foreground">
            Nenhuma alternativa secundária identificada para esta especificação aduaneira.
          </div>
        ) : (
          <div className="space-y-2.5">
            {alternatives.map((alt, idx) => {
              const itemKey = `alt-${idx}`
              const isSelected = selectedKey === itemKey

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedKey(itemKey)}
                  className={`border rounded-lg p-3.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary/80 bg-primary/[0.03] ring-1 ring-primary/20 shadow-sm'
                      : 'border-border/60 bg-card hover:bg-muted/30 hover:border-border'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                          Alternativa #{idx + 1}
                        </span>
                        {alt.alternatives_source && renderSourceBadge(alt.alternatives_source)}
                      </div>

                      <div className="flex items-baseline gap-2 pt-0.5">
                        <span className="font-mono font-bold text-base sm:text-lg text-foreground">
                          {formatNcmCode(alt.ncm)}
                        </span>
                        {alt.ex ? (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            Ex {alt.ex}
                          </Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground ml-auto sm:ml-2">
                          Total Tributos:{' '}
                          <span className="font-mono font-semibold text-foreground">
                            {formatTaxPercent(alt.total_tax)}
                          </span>
                        </span>
                      </div>

                      {alt.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {alt.description}
                        </p>
                      )}
                    </div>

                    {/* Radio para Seleção */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <RadioGroup value={selectedKey} onValueChange={setSelectedKey}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value={itemKey} id={`radio-${itemKey}`} />
                          <Label
                            htmlFor={`radio-${itemKey}`}
                            className="text-xs font-medium cursor-pointer"
                          >
                            {isSelected ? 'Selecionado' : 'Escolher'}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>

                  {/* Resumo de Alíquotas da Alternativa */}
                  <div className="mt-2.5 pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-3">
                      <span>
                        II: <strong className="text-foreground">{formatTaxPercent(alt.ii)}</strong>
                      </span>
                      <span>
                        IPI:{' '}
                        <strong className="text-foreground">{formatTaxPercent(alt.ipi)}</strong>
                      </span>
                      <span>
                        PIS:{' '}
                        <strong className="text-foreground">{formatTaxPercent(alt.pis)}</strong>
                      </span>
                      <span>
                        COFINS:{' '}
                        <strong className="text-foreground">{formatTaxPercent(alt.cofins)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Justificativa / Razão de Rebaixamento ou Descarte da Alternativa */}
                  {(alt.reason || alt.justification) && (
                    <div className="mt-2.5 pt-2 border-t border-border/40">
                      {isSelected ? (
                        <Collapsible
                          open={isAltJustificationOpen}
                          onOpenChange={setIsAltJustificationOpen}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="w-full flex items-center justify-between text-left text-[11px] font-semibold text-primary hover:underline"
                            >
                              <span>Por que esta opção foi hierarquizada como secundária?</span>
                              {isAltJustificationOpen ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1.5 p-2.5 rounded bg-muted/40 border text-xs text-foreground/80 leading-relaxed italic break-words [overflow-wrap:anywhere]">
                            {alt.reason || alt.justification}
                          </CollapsibleContent>
                        </Collapsible>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic line-clamp-2">
                          {alt.reason || alt.justification}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 4. Fontes Web Consultadas (se houver) */}
      {data.web_sources && data.web_sources.length > 0 && (
        <Card className="border-border/60 bg-muted/10">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <ExternalLink className="w-3.5 h-3.5 text-primary" />
              Fontes Externas Consultadas (Busca Web Condicional)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <ul className="space-y-1.5">
              {data.web_sources.map((src, idx) => (
                <li key={idx} className="flex items-center gap-2 text-xs truncate">
                  <span className="text-muted-foreground">•</span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate flex items-center gap-1"
                    title={src.title || src.url}
                  >
                    <span>{src.title || src.url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 5. Ação de Confirmação Primária */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-card border-2 border-primary/20 shadow-sm">
        <div className="text-xs space-y-0.5 text-center sm:text-left">
          <div className="text-muted-foreground">Classificação atualmente selecionada:</div>
          <div className="font-mono text-base font-bold text-foreground flex items-center justify-center sm:justify-start gap-1.5">
            <span>{formatNcmCode(active.item?.ncm)}</span>
            {active.item?.ex && (
              <Badge variant="outline" className="text-xs">
                Ex {active.item.ex}
              </Badge>
            )}
            {active.isRecommended ? (
              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                Recomendado
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Alternativa
              </Badge>
            )}
          </div>
        </div>

        <Button
          size="lg"
          onClick={handleConfirm}
          disabled={readOnly || isConfirmed}
          className="w-full sm:w-auto font-semibold px-6 shadow bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isConfirmed ? (
            <>
              <Check className="w-4 h-4 mr-2" /> NCM Confirmado
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" /> Confirmar NCM Selecionado
            </>
          )}
        </Button>
      </div>

      {/* 6. Rodapé com Telemetria para Diagnóstico de Divergências */}
      <div className="p-3 rounded-lg border bg-muted/20 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-y-1.5 gap-x-4 font-mono">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <span>
            Versão: <strong>{data.version || 'v3.7.0'}</strong>
          </span>
        </div>

        {data.analyst_model && (
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
            <span>
              Analista: <strong>{data.analyst_model}</strong>
            </span>
          </div>
        )}

        {data.auditor_model && (
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
            <span>
              Auditor: <strong>{data.auditor_model}</strong>
            </span>
          </div>
        )}

        {typeof data.execution_time_ms === 'number' && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span>
              Tempo: <strong>{data.execution_time_ms}ms</strong>
            </span>
          </div>
        )}

        {data.audit_id && (
          <div className="truncate max-w-[200px]" title={data.audit_id}>
            Audit ID: <strong>{data.audit_id.slice(0, 8)}...</strong>
          </div>
        )}
      </div>
    </div>
  )
}

export default NcmSelectionExample
