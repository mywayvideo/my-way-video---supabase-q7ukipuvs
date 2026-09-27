import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Scale,
  FileText,
  Info,
  RefreshCw,
  Search,
  Check,
} from 'lucide-react'
import {
  classifyNcm,
  updateNcmClassificationDecision,
  logNcmClassification,
  type ClassifyNcmResponse,
} from '@/services/ncmService'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'

interface NcmSuggestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  productDescription: string
  brandName?: string
  modelName?: string
  additionalSpecs?: string
  currentNcm?: string
  productId?: string
  onApplyNcm: (cleanNcm: string, ex?: string) => void
}

/** Formata código NCM para exibição legível 0000.00.00 */
export function formatNcmDisplay(code: string | null | undefined): string {
  if (!code) return '—'
  const digits = String(code).replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  return code
}

/** Remove pontuação de NCM para armazenamento no banco (8 dígitos) */
export function cleanNcmDigits(code: string | null | undefined): string {
  if (!code) return ''
  return String(code).replace(/\D/g, '').slice(0, 8)
}

export function NcmSuggestDialog({
  open,
  onOpenChange,
  productName,
  productDescription,
  brandName,
  modelName,
  additionalSpecs,
  currentNcm,
  productId,
  onApplyNcm,
}: NcmSuggestDialogProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ClassifyNcmResponse | null>(null)
  const [appliedNcm, setAppliedNcm] = useState<string | null>(null)

  // Ao abrir o diálogo sem resultado ou caso queira reexecutar
  const handleRunAnalysis = async () => {
    const fullDesc = [productName, productDescription].filter(Boolean).join(' - ')
    if (!fullDesc || fullDesc.trim().length < 5) {
      setError(
        'Forneça ao menos o nome ou descrição do produto no formulário para que a IA possa classificar.',
      )
      return
    }

    setIsLoading(true)
    setError(null)
    setAppliedNcm(null)

    try {
      const response = await classifyNcm({
        productDescription: fullDesc,
        brand: brandName,
        model: modelName,
        additionalSpecs,
        productId,
        saveLog: true,
      })

      if (!response.success || !response.recommendation) {
        throw new Error('Não foi possível obter uma recomendação de NCM do agente.')
      }

      setResult(response)
    } catch (err: any) {
      console.error('Erro na classificação NCM:', err)
      const msg =
        err?.message ||
        'Ocorreu um erro ao consultar o agente de classificação NCM. Verifique os dados e tente novamente.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-dispara quando o diálogo abre e ainda não temos dados ou se estava vazio
  React.useEffect(() => {
    if (open && !result && !isLoading && !error) {
      handleRunAnalysis()
    }
  }, [open])

  const handleApply = async (ncm: string, ex?: string, isRecommended = false) => {
    const clean = cleanNcmDigits(ncm)
    if (!clean) return

    // 1. Atualiza formulário pai
    onApplyNcm(clean, ex)
    setAppliedNcm(clean)

    // 2. Grava a decisão do usuário no log de auditoria
    try {
      if (result?.audit_id) {
        await updateNcmClassificationDecision({
          auditId: result.audit_id,
          finalChoiceNcm: clean,
          finalChoiceEx: ex || '',
          confirmedBy: user?.id || null,
          status: 'aceito',
        })
      } else {
        // Fallback caso não tenha audit_id
        await logNcmClassification({
          input_description: [productName, productDescription].filter(Boolean).join(' - '),
          final_choice_ncm: clean,
          final_choice_ex: ex || '',
          confirmed_by: user?.id || null,
          status: 'aceito',
          product_id: productId || null,
          agent_suggestion: (result as any) || {},
        })
      }
    } catch (logErr) {
      console.warn('Não foi possível atualizar o log de auditoria:', logErr)
    }

    toast({
      title: 'NCM Aplicado!',
      description: `O código ${formatNcmDisplay(clean)}${ex ? ` (Ex ${ex})` : ''} foi preenchido no produto.`,
    })

    // Fecha o modal após aplicar com feedback
    setTimeout(() => {
      onOpenChange(false)
    }, 400)
  }

  const renderConfidenceBadge = (confidence?: 'alta' | 'media' | 'baixa') => {
    switch (confidence) {
      case 'alta':
        return (
          <Badge className="bg-emerald-600/90 hover:bg-emerald-600 text-white border-0 font-medium text-xs">
            Confiança Alta
          </Badge>
        )
      case 'media':
        return (
          <Badge className="bg-amber-600/90 hover:bg-amber-600 text-white border-0 font-medium text-xs">
            Confiança Média
          </Badge>
        )
      case 'baixa':
        return (
          <Badge className="bg-rose-600/90 hover:bg-rose-600 text-white border-0 font-medium text-xs">
            Confiança Baixa
          </Badge>
        )
      default:
        return null
    }
  }

  const cleanCurrent = cleanNcmDigits(currentNcm)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border sm:rounded-xl">
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b bg-muted/20 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-primary">
                <Sparkles className="w-5 h-5 text-amber-500 animate-pulse shrink-0" />
                <span>Sugerir Classificação Fiscal NCM por IA</span>
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
                Análise aduaneira automática com NESH, alíquotas efetivas de impostos e verificação
                de Ex-Tarifários vigentes.
              </DialogDescription>
            </div>
            {result?.confidence && (
              <div className="shrink-0">{renderConfidenceBadge(result.confidence)}</div>
            )}
          </div>

          {/* Dados do produto informado */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-background/80 p-2.5 rounded-md border">
            <div className="min-w-0">
              <span className="text-muted-foreground font-medium">Produto: </span>
              <span
                className="font-semibold text-foreground break-words line-clamp-2"
                title={productName}
              >
                {productName || 'Não informado'}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-muted-foreground font-medium">Marca/Modelo: </span>
              <span className="font-semibold text-foreground break-words">
                {[brandName, modelName].filter(Boolean).join(' / ') || 'Não informado'}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-muted-foreground font-medium">NCM Atual no Form: </span>
              <span className="font-mono font-semibold text-foreground">
                {cleanCurrent ? formatNcmDisplay(cleanCurrent) : 'Nenhum'}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Corpo com Scroll interno sem truncamento */}
        <ScrollArea className="flex-1 min-h-0 w-full p-4 sm:p-6 overflow-y-auto">
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="relative">
                <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
                <Sparkles className="w-5 h-5 text-primary absolute -top-1 -right-1" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-semibold">Analisando especificações aduaneiras...</h4>
                <p className="text-xs text-muted-foreground max-w-md">
                  Consultando base NCM de todos os capítulos (84, 85, 90, 94), regras gerais de
                  interpretação NESH e alíquotas vigentes da Receita Federal.
                </p>
              </div>
            </div>
          )}

          {error && !isLoading && (
            <div className="space-y-4 py-6">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Não foi possível sugerir o NCM</AlertTitle>
                <AlertDescription className="text-xs mt-1">{error}</AlertDescription>
              </Alert>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleRunAnalysis}
                  className="bg-primary hover:bg-primary/90"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Tentar Novamente
                </Button>
              </div>
            </div>
          )}

          {result && !isLoading && (
            <div className="space-y-6">
              {/* Relatório Comparativo: Tabela Recomendado vs Alternativos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Scale className="w-4 h-4 text-amber-500" />
                    Relatório Comparativo de Alíquotas e Enquadramento
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Base: imp_sim_tax_rates_effective
                  </span>
                </div>

                <div className="border rounded-lg overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/60 text-muted-foreground font-semibold border-b">
                        <tr>
                          <th className="py-2.5 px-3">Classificação</th>
                          <th className="py-2.5 px-3">NCM</th>
                          <th className="py-2.5 px-3">Ex</th>
                          <th className="py-2.5 px-3 text-right">II</th>
                          <th className="py-2.5 px-3 text-right">IPI</th>
                          <th className="py-2.5 px-3 text-right">PIS</th>
                          <th className="py-2.5 px-3 text-right">COFINS</th>
                          <th className="py-2.5 px-3 text-right font-bold text-foreground">
                            Carga
                          </th>
                          <th className="py-2.5 px-3 text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {/* Linha Recomendada */}
                        <tr className="bg-amber-500/10 font-medium">
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="inline-flex items-center gap-1 text-amber-500 font-bold">
                                <Sparkles className="w-3 h-3" />
                                Recomendado
                              </span>
                              {Boolean(
                                result.recommendation.ex || result.recommendation.has_ex_tarifario,
                              ) &&
                                Number(result.recommendation.ii) <= 2 && (
                                  <Badge
                                    variant="destructive"
                                    className="text-[9px] py-0 px-1 font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 hover:bg-amber-500/30"
                                  >
                                    Requer revisão especialista
                                  </Badge>
                                )}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-primary">
                            {formatNcmDisplay(result.recommendation.ncm)}
                          </td>
                          <td className="py-3 px-3 font-mono text-muted-foreground">
                            {result.recommendation.ex ? (
                              <div className="flex flex-col gap-1 items-start">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] py-0 px-1 border-amber-500 text-amber-500"
                                >
                                  Ex {result.recommendation.ex}
                                </Badge>
                                {Number(result.recommendation.ii) <= 2 && (
                                  <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                                    II Reduzido ({result.recommendation.ii}%)
                                  </span>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">{result.recommendation.ii}%</td>
                          <td className="py-3 px-3 text-right">{result.recommendation.ipi}%</td>
                          <td className="py-3 px-3 text-right">{result.recommendation.pis}%</td>
                          <td className="py-3 px-3 text-right">{result.recommendation.cofins}%</td>
                          <td className="py-3 px-3 text-right font-bold text-amber-500">
                            {result.recommendation.total_tax}%
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-sm"
                              disabled={appliedNcm === cleanNcmDigits(result.recommendation.ncm)}
                              onClick={() =>
                                handleApply(
                                  result.recommendation.ncm,
                                  result.recommendation.ex,
                                  true,
                                )
                              }
                            >
                              {appliedNcm === cleanNcmDigits(result.recommendation.ncm) ? (
                                <>
                                  <Check className="w-3.5 h-3.5 mr-1" /> Aplicado
                                </>
                              ) : (
                                'Aplicar'
                              )}
                            </Button>
                          </td>
                        </tr>

                        {/* Linhas Alternativas */}
                        {result.alternatives && result.alternatives.length > 0 ? (
                          result.alternatives.map((alt, idx) => {
                            const isApplied = appliedNcm === cleanNcmDigits(alt.ncm)
                            return (
                              <tr key={idx} className="hover:bg-muted/40 transition-colors">
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  Alternativa #{idx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-semibold">
                                  {formatNcmDisplay(alt.ncm)}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-muted-foreground">
                                  {alt.ex ? (
                                    <div className="flex flex-col gap-1 items-start">
                                      <Badge variant="outline" className="text-[10px] py-0 px-1">
                                        Ex {alt.ex}
                                      </Badge>
                                      {Number(alt.ii) <= 2 && (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] py-0 px-1 text-amber-600 dark:text-amber-400 border-amber-500/40"
                                        >
                                          Revisão
                                        </Badge>
                                      )}
                                    </div>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right text-muted-foreground">
                                  {alt.ii}%
                                </td>
                                <td className="py-2.5 px-3 text-right text-muted-foreground">
                                  {alt.ipi}%
                                </td>
                                <td className="py-2.5 px-3 text-right text-muted-foreground">
                                  {alt.pis}%
                                </td>
                                <td className="py-2.5 px-3 text-right text-muted-foreground">
                                  {alt.cofins}%
                                </td>
                                <td className="py-2.5 px-3 text-right font-medium text-foreground">
                                  {alt.total_tax}%
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    disabled={isApplied}
                                    onClick={() => handleApply(alt.ncm, alt.ex, false)}
                                  >
                                    {isApplied ? (
                                      <>
                                        <Check className="w-3 h-3 mr-1" /> Aplicado
                                      </>
                                    ) : (
                                      'Aplicar'
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan={9} className="py-3 px-3 text-center text-muted-foreground">
                              Nenhuma alternativa adicional identificada para esta especificação.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Justificativa Técnica do NCM Recomendado */}
              <div className="p-4 border rounded-lg bg-muted/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                    <FileText className="w-4 h-4 text-primary" />
                    Justificativa Técnica e Fundamento Legal (NESH)
                  </h4>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    NCM {formatNcmDisplay(result.recommendation.ncm)}
                  </span>
                </div>

                {result.recommendation.description && (
                  <div className="text-xs font-medium text-foreground/90 bg-muted/30 p-3 rounded border border-border/50 break-words [overflow-wrap:anywhere]">
                    <span className="text-muted-foreground font-semibold">
                      Descrição Oficial NCM:{' '}
                    </span>
                    <span className="leading-relaxed">{result.recommendation.description}</span>
                  </div>
                )}

                <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line bg-background/50 p-3.5 rounded border break-words [overflow-wrap:anywhere]">
                  {result.recommendation.justification ||
                    'Justificativa técnica não fornecida pelo agente.'}
                </div>

                {/* Ex-Tarifário Detalhes */}
                {result.recommendation.has_ex_tarifario && result.recommendation.ex_details && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs space-y-1.5 break-words [overflow-wrap:anywhere]">
                    <div className="font-semibold text-amber-500 flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Ex-Tarifário Vinculado: Ex {result.recommendation.ex}</span>
                      </div>
                      {Number(result.recommendation.ii) <= 2 && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40"
                        >
                          Requer revisão especialista (II {result.recommendation.ii}%)
                        </Badge>
                      )}
                    </div>
                    {result.recommendation.ex_details.descricao && (
                      <p className="text-foreground/90 leading-relaxed">
                        <span className="text-muted-foreground font-semibold">Condição: </span>
                        {result.recommendation.ex_details.descricao}
                      </p>
                    )}
                    {result.recommendation.ex_details.resolucao && (
                      <p className="text-[11px] text-muted-foreground pt-1">
                        Resolução: {result.recommendation.ex_details.resolucao}{' '}
                        {result.recommendation.ex_details.data_fim &&
                          `| Vigência até: ${result.recommendation.ex_details.data_fim}`}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Justificativa das Alternativas (Prós/Contras) */}
              {result.alternatives && result.alternatives.length > 0 && (
                <div className="p-4 border rounded-lg bg-muted/5 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                    <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                    Análise das Alternativas Avaliadas
                  </h4>
                  <div className="space-y-2">
                    {result.alternatives.map((alt, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-background/60 rounded border text-xs space-y-1.5 break-words [overflow-wrap:anywhere]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-semibold text-foreground font-mono">
                            NCM {formatNcmDisplay(alt.ncm)} {alt.ex ? `(Ex ${alt.ex})` : ''}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Carga: {alt.total_tax}% (II: {alt.ii}%, IPI: {alt.ipi}%)
                          </span>
                        </div>
                        {alt.description && (
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {alt.description}
                          </p>
                        )}
                        {alt.reason && (
                          <p className="text-foreground/80 italic text-[11px] leading-relaxed border-l-2 border-border pl-2">
                            {alt.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fontes Web e Auditoria */}
              {result.web_sources && result.web_sources.length > 0 && (
                <div className="p-3 border rounded-lg bg-muted/10 space-y-2 text-xs">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-primary" />
                    Fontes Externas Consultadas (Busca Web Condicional)
                  </div>
                  <ul className="space-y-1">
                    {result.web_sources.map((src, idx) => (
                      <li key={idx} className="flex items-center gap-1 text-[11px] truncate">
                        <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary hover:underline truncate"
                        >
                          {src.title || src.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Metadados da Execução */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-2 border-t">
                <span>
                  Modelo IA: <span className="font-mono text-foreground">{result.model_used}</span>
                </span>
                <span>
                  Tempo:{' '}
                  <span className="font-mono text-foreground">{result.execution_time_ms}ms</span>
                </span>
                <span>
                  Candidatos avaliados:{' '}
                  <span className="font-mono text-foreground">{result.candidates_count}</span>
                </span>
                {result.audit_id && (
                  <span title={result.audit_id} className="truncate max-w-[200px]">
                    Auditoria:{' '}
                    <span className="font-mono text-foreground">
                      {result.audit_id.slice(0, 8)}...
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Footer com Ações */}
        <div className="p-4 border-t bg-muted/20 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunAnalysis}
            disabled={isLoading}
            className="text-xs"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Reanalisar Produto
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Fechar
            </Button>
            {result?.recommendation && (
              <Button
                size="sm"
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                disabled={appliedNcm === cleanNcmDigits(result.recommendation.ncm)}
                onClick={() =>
                  handleApply(result.recommendation.ncm, result.recommendation.ex, true)
                }
              >
                {appliedNcm === cleanNcmDigits(result.recommendation.ncm) ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5" /> NCM Aplicado
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5" /> Aplicar NCM Recomendado (
                    {formatNcmDisplay(result.recommendation.ncm)})
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
