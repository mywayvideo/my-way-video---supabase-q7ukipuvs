import React, { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  XCircle,
  Sparkles,
  ArrowRight,
  Search,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  priceCheckService,
  PriceCheckResult,
  PriceCheckRecord,
  PriceCheckStatus,
  evaluatePairedPrices,
  PairedCheckEvaluation,
  extractRebateInfo,
  resolvePairedEvaluation,
} from '@/services/priceCheckService'
import { rebateDiscountService, ExistingRebateRule } from '@/services/rebateDiscountService'
import { RebateDiscountModal } from '@/components/admin/RebateDiscountModal'
import { ProductBatchItem } from '@/services/bhBatchUpdateService'

interface BhPriceCheckerProps {
  productId: string
  productName?: string | null | undefined
  currentPriceUsd: number | null | undefined
  websiteUrl: string | null | undefined
  sku: string | null | undefined
  onPriceUpdated?: () => void
  onPriceApplied?: (appliedPrice: number) => void
  onUrlDiscovered?: (newUrl: string) => void
  onRebateSaved?: () => void
}

export const BhPriceChecker: React.FC<BhPriceCheckerProps> = ({
  productId,
  productName,
  currentPriceUsd,
  websiteUrl,
  sku,
  onPriceUpdated,
  onPriceApplied,
  onUrlDiscovered,
  onRebateSaved,
}) => {
  const [isChecking, setIsChecking] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [lastRecord, setLastRecord] = useState<PriceCheckRecord | null>(null)
  const [currentResult, setCurrentResult] = useState<PriceCheckResult | null>(null)

  // Estado da regra "Rebate Fabricante" e do modal
  const [existingRebateRule, setExistingRebateRule] = useState<ExistingRebateRule | null>(null)
  const [isRebateModalOpen, setIsRebateModalOpen] = useState(false)

  const loadExistingRebate = useCallback(async () => {
    if (!productId) return
    try {
      const rule = await rebateDiscountService.findActiveRebateRule(productId)
      setExistingRebateRule(rule)
    } catch (err) {
      console.warn('Erro ao verificar regra existente de rebate:', err)
    }
  }, [productId])

  useEffect(() => {
    let mounted = true
    if (productId) {
      priceCheckService.getLatestCheck(productId).then((rec) => {
        if (mounted && rec) {
          setLastRecord(rec)
        }
      })
      loadExistingRebate()
    }
    return () => {
      mounted = false
    }
  }, [productId, loadExistingRebate])

  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const res = await priceCheckService.checkBhPrice(productId)
      setCurrentResult(res)

      // Se houver rebate cadastrado e rebate na B&H, avalia pareamento imediatamente
      const activeRule =
        existingRebateRule ?? (await rebateDiscountService.findActiveRebateRule(productId))
      if (activeRule && !existingRebateRule) {
        setExistingRebateRule(activeRule)
      }

      const evalRes = evaluatePairedPrices({
        catalogPriceUsd: res.price_usd_cadastrado ?? currentPriceUsd ?? null,
        rebateRule: activeRule,
        bhPrice: res.price_bh ?? null,
        bhPriceFull: res.price_full ?? null,
        bhPriceWithRebate: res.price_with_rebate ?? null,
        bhRebateActive: res.rebate_active,
      })

      const finalStatus =
        res.status === 'descontinuado' ||
        res.status === 'sem_url_confirmada' ||
        res.status === 'erro'
          ? res.status
          : evalRes.status

      const finalMessage =
        res.status === 'descontinuado' ||
        res.status === 'sem_url_confirmada' ||
        res.status === 'erro'
          ? res.message
          : evalRes.message

      // Atualiza o registro visual
      setLastRecord({
        id: 'latest',
        product_id: productId,
        checked_at: res.checked_at || new Date().toISOString(),
        price_db: res.price_usd_cadastrado ?? currentPriceUsd ?? null,
        price_bh: res.price_bh ?? null,
        diff_usd: res.diff_usd ?? null,
        diff_pct: res.diff_pct ?? null,
        status: finalStatus,
        source: 'manual',
        url_used: res.url_used ?? null,
        url_discovered: !!res.url_discovered,
        message: finalMessage || null,
        raw: {
          rebate_info: {
            rebate_active: res.rebate_active,
            price_full: res.price_full,
            price_with_rebate: res.price_with_rebate,
            rebate_savings: res.rebate_savings,
            rebate_end_date: res.rebate_end_date,
          },
        },
      })

      if (finalStatus === 'ok') {
        toast({
          title: 'Preço B&H conferido!',
          description: finalMessage || 'O preço cadastrado está dentro da tolerância acordada.',
        })
      } else if (finalStatus === 'divergente') {
        toast({
          title: 'Divergência detectada!',
          description:
            finalMessage || 'O preço na B&H difere do cadastrado além da tolerância permitida.',
          variant: 'default',
        })
      } else if (res.status === 'descontinuado') {
        toast({
          title: 'Descontinuado pelo fabricante',
          description: 'A B&H indica que este item foi descontinuado.',
          variant: 'destructive',
        })
      } else if (res.status === 'sem_url_confirmada') {
        toast({
          title: 'URL não confirmada',
          description: res.message || 'Revise a URL no cadastro do produto.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Falha na verificação',
          description: res.message || 'Não foi possível verificar o preço na B&H.',
          variant: 'destructive',
        })
      }

      if (res.url_discovered) {
        if (res.url_used && onUrlDiscovered) {
          onUrlDiscovered(res.url_used)
        }
        if (onPriceUpdated) {
          // Se uma nova URL foi descoberta e gravada no banco, atualiza os dados do produto
          onPriceUpdated()
        }
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao verificar preço',
        description: err.message || 'Falha de comunicação.',
        variant: 'destructive',
      })
    } finally {
      setIsChecking(false)
    }
  }

  const handleApplyPrice = async () => {
    const targetPrice = targetApplyPrice ?? currentResult?.price_bh ?? lastRecord?.price_bh
    if (!targetPrice || targetPrice <= 0) return

    setIsApplying(true)
    try {
      await priceCheckService.applyBhPrice(productId, targetPrice)
      toast({
        title: 'Preço B&H aplicado com sucesso!',
        description: `Preço FOB Miami atualizado para US$ ${targetPrice.toFixed(2)}. O preço BRL foi recalculado.`,
      })

      // Atualiza estado local
      if (lastRecord) {
        setLastRecord({
          ...lastRecord,
          status: 'ok',
          price_db: targetPrice,
          diff_usd: 0,
          diff_pct: 0,
          message: 'Preço atualizado a partir da B&H.',
        })
      }
      if (currentResult) {
        setCurrentResult({
          ...currentResult,
          status: 'ok',
          price_usd_cadastrado: targetPrice,
          diff_usd: 0,
          diff_pct: 0,
        })
      }

      if (onPriceApplied) {
        onPriceApplied(targetPrice)
      }

      if (onPriceUpdated) {
        onPriceUpdated()
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao aplicar preço',
        description: err.message || 'Não foi possível atualizar o preço.',
        variant: 'destructive',
      })
    } finally {
      setIsApplying(false)
    }
  }

  // Dados para exibição: resultado atual ou último salvo
  const activeStatus: PriceCheckStatus | null = currentResult?.status ?? lastRecord?.status ?? null
  const displayPriceDb =
    currentResult?.price_usd_cadastrado ?? lastRecord?.price_db ?? currentPriceUsd ?? null
  const displayPriceBh = currentResult?.price_bh ?? lastRecord?.price_bh ?? null
  const displayDiffUsd = currentResult?.diff_usd ?? lastRecord?.diff_usd ?? null
  const displayDiffPct = currentResult?.diff_pct ?? lastRecord?.diff_pct ?? null
  const displayUrl = currentResult?.url_used ?? lastRecord?.url_used ?? websiteUrl ?? null
  const isDiscovered = currentResult?.url_discovered ?? lastRecord?.url_discovered ?? false
  const checkedAt = currentResult?.checked_at ?? lastRecord?.checked_at ?? null
  const displayMessage = currentResult?.message ?? lastRecord?.message ?? null

  // Dados de rebate: unificados via helper compartilhado
  const {
    isBhRebateActive,
    rebatePriceFull,
    rebatePriceWithDiscount,
    rebateSavings,
    rebateEndDate,
    rebateEndDateIso,
  } = extractRebateInfo({
    checkResult: currentResult,
    raw: lastRecord?.raw,
    message: displayMessage,
    catalogPriceUsd: displayPriceDb,
  })

  // Avaliação pareada (cheio × cheio e desconto × desconto quando houver rebate vigente)
  const { effectiveStatus, effectiveMessage, pairedEval } = resolvePairedEvaluation({
    status: activeStatus,
    catalogPriceUsd: displayPriceDb,
    rebateRule: existingRebateRule,
    priceBh: displayPriceBh,
    priceFull: rebatePriceFull,
    priceWithRebate: rebatePriceWithDiscount,
    isBhRebateActive,
    defaultMessage: displayMessage,
  })

  const targetApplyPrice =
    rebatePriceFull != null && isBhRebateActive ? rebatePriceFull : displayPriceBh

  const canApplyPrice =
    targetApplyPrice != null &&
    targetApplyPrice > 0 &&
    (effectiveStatus === 'divergente' ||
      (displayPriceDb != null && displayPriceDb !== targetApplyPrice))

  // Objeto sintético do produto para o RebateDiscountModal
  const modalProduct: ProductBatchItem = {
    id: productId,
    name: productName || (sku ? `Produto SKU ${sku}` : 'Produto'),
    sku: sku || null,
    price_usd: displayPriceDb ?? currentPriceUsd ?? null,
    website_url: displayUrl || null,
    is_discontinued: activeStatus === 'descontinuado',
    updated_at: '',
    last_reviewed_at: '',
    checkResult: {
      status: effectiveStatus || 'divergente',
      price_usd_cadastrado: displayPriceDb,
      price_bh: displayPriceBh,
      diff_usd: displayDiffUsd,
      diff_pct: displayDiffPct,
      url_used: displayUrl,
      rebate_active: isBhRebateActive,
      price_full: rebatePriceFull,
      price_with_rebate: rebatePriceWithDiscount,
      rebate_savings: rebateSavings,
      rebate_end_date: rebateEndDate,
      rebate_end_date_iso: rebateEndDateIso,
    },
  }

  const renderStatusBadge = () => {
    switch (effectiveStatus) {
      case 'ok':
        return (
          <Badge className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Conferido (OK)
          </Badge>
        )
      case 'divergente':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Preço Divergente
          </Badge>
        )
      case 'descontinuado':
        return (
          <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
            <AlertOctagon className="w-3.5 h-3.5" /> Descontinuado pelo Fabricante
          </Badge>
        )
      case 'sem_url_confirmada':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" /> URL Não Confirmada
          </Badge>
        )
      case 'erro':
        return (
          <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Erro na Verificação
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground border-border/50">
            Ainda não verificado
          </Badge>
        )
    }
  }

  return (
    <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs">
            B&H
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              Auditoria de Preço B&H (Tempo Real)
              {renderStatusBadge()}
            </h3>
            <p className="text-xs text-muted-foreground">
              Tolerância padrão: 1% ou US$ 1,00 (o que for maior).
            </p>
          </div>
        </div>

        <Button
          onClick={handleCheck}
          disabled={isChecking || isApplying}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all h-9"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Verificando na B&H...' : 'Verificar Preço na B&H'}
        </Button>
      </div>

      {/* Painel com o resultado da verificação */}
      {effectiveStatus && (
        <div className="mt-4 pt-1 space-y-4">
          {/* Se a comparação for pareada (ambos os lados com rebate ativo) */}
          {pairedEval && pairedEval.mode === 'paired' ? (
            <div className="space-y-3">
              {/* Card Par Cheio */}
              <div className="bg-muted/30 border border-border/50 rounded-lg p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/30">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    Par Preço Cheio (FOB Base)
                  </span>
                  {pairedEval.fullPair ? (
                    pairedEval.fullPair.isWithinTolerance ? (
                      <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Cheio OK (sem divergência)
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Divergente
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">
                      B&H sem preço cheio separado
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-2.5 bg-background/60 rounded border border-border/30">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                      Cadastrado Cheio
                    </span>
                    <span className="text-sm font-bold font-mono text-foreground mt-0.5 block">
                      {displayPriceDb != null ? `US$ ${displayPriceDb.toFixed(2)}` : 'US$ —'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-background/60 rounded border border-border/30">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                      B&H Preço Regular
                    </span>
                    <span className="text-sm font-bold font-mono text-blue-400 mt-0.5 block">
                      {pairedEval.fullPair?.priceBh != null
                        ? `US$ ${pairedEval.fullPair.priceBh.toFixed(2)}`
                        : 'Não reportado'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-background/60 rounded border border-border/30">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                      Divergência Cheio
                    </span>
                    <span
                      className={`text-sm font-bold font-mono mt-0.5 block ${
                        pairedEval.fullPair == null || pairedEval.fullPair.diffUsd === 0
                          ? 'text-muted-foreground'
                          : pairedEval.fullPair.isWithinTolerance
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {pairedEval.fullPair?.diffUsd != null
                        ? `${pairedEval.fullPair.diffUsd > 0 ? '+' : ''}US$ ${pairedEval.fullPair.diffUsd.toFixed(2)} (${pairedEval.fullPair.diffPct != null && pairedEval.fullPair.diffPct > 0 ? '+' : ''}${pairedEval.fullPair.diffPct?.toFixed(2)}%)`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Par Com Desconto / Rebate */}
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-purple-500/20">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-purple-300">
                    <Tag className="w-3.5 h-3.5 text-purple-400" />
                    Par com Desconto / Rebate Vigente
                  </span>
                  {pairedEval.rebatePair?.isWithinTolerance ? (
                    <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Rebate OK (sem divergência)
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Divergente
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-2.5 bg-background/60 rounded border border-purple-500/20">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                      Cadastrado com Desconto
                    </span>
                    <span className="text-sm font-bold font-mono text-purple-300 mt-0.5 block">
                      {pairedEval.catalogEffectivePrice != null
                        ? `US$ ${pairedEval.catalogEffectivePrice.toFixed(2)}`
                        : 'US$ —'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-background/60 rounded border border-purple-500/20">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                      B&H com Rebate
                    </span>
                    <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block">
                      {pairedEval.rebatePair?.priceBh != null
                        ? `US$ ${pairedEval.rebatePair.priceBh.toFixed(2)}`
                        : 'US$ —'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-background/60 rounded border border-purple-500/20">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                      Divergência Rebate
                    </span>
                    <span
                      className={`text-sm font-bold font-mono mt-0.5 block ${
                        pairedEval.rebatePair == null || pairedEval.rebatePair.diffUsd === 0
                          ? 'text-muted-foreground'
                          : pairedEval.rebatePair.isWithinTolerance
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {pairedEval.rebatePair?.diffUsd != null
                        ? `${pairedEval.rebatePair.diffUsd > 0 ? '+' : ''}US$ ${pairedEval.rebatePair.diffUsd.toFixed(2)} (${pairedEval.rebatePair.diffPct != null && pairedEval.rebatePair.diffPct > 0 ? '+' : ''}${pairedEval.rebatePair.diffPct?.toFixed(2)}%)`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Layout clássico / simples quando não há rebate vigente pareado */
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-muted/40 rounded-lg border border-border/40">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                  Preço Cadastrado
                </span>
                <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                  {displayPriceDb != null ? `US$ ${displayPriceDb.toFixed(2)}` : 'US$ —'}
                </span>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg border border-border/40">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                  Preço B&H (Tempo Real)
                </span>
                <span className="text-base font-bold font-mono text-emerald-400 mt-0.5 block">
                  {displayPriceBh != null ? `US$ ${displayPriceBh.toFixed(2)}` : 'Não identificado'}
                </span>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg border border-border/40">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                  Divergência
                </span>
                <span
                  className={`text-base font-bold font-mono mt-0.5 block ${
                    displayDiffUsd == null || displayDiffUsd === 0
                      ? 'text-muted-foreground'
                      : displayDiffUsd > 0
                        ? 'text-amber-400'
                        : 'text-blue-400'
                  }`}
                >
                  {displayDiffUsd != null
                    ? `${displayDiffUsd > 0 ? '+' : ''}US$ ${displayDiffUsd.toFixed(2)} (${displayDiffPct != null && displayDiffPct > 0 ? '+' : ''}${displayDiffPct != null ? displayDiffPct.toFixed(2) : '0.00'}%)`
                    : '—'}
                </span>
              </div>
            </div>
          )}

          {/* Mensagem e aviso */}
          {effectiveMessage && (
            <div
              className={`p-3 rounded-lg text-xs leading-relaxed border flex items-start gap-2.5 ${
                effectiveStatus === 'ok'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  : effectiveStatus === 'divergente'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                    : effectiveStatus === 'descontinuado'
                      ? 'bg-red-500/10 text-red-300 border-red-500/20'
                      : 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
              }`}
            >
              {effectiveStatus === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : effectiveStatus === 'divergente' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : effectiveStatus === 'descontinuado' ? (
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <HelpCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span>{effectiveMessage}</span>
                {effectiveStatus === 'sem_url_confirmada' && (
                  <p className="mt-1 font-medium text-yellow-200">
                    Dica: acesse a edição deste produto e cole manualmente a URL da página da B&H no
                    campo &quot;URL da B&H (website_url)&quot;.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* URL e data da verificação */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              {displayUrl ? (
                <>
                  <span className="font-medium text-foreground">URL usada:</span>
                  <a
                    href={displayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 font-mono max-w-[280px] sm:max-w-[360px] truncate"
                    title={displayUrl}
                  >
                    {displayUrl}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  {isDiscovered && (
                    <Badge
                      variant="secondary"
                      className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] py-0 px-1.5 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Confirmada por SKU e salva
                    </Badge>
                  )}
                </>
              ) : (
                <span className="italic flex items-center gap-1">
                  <Search className="w-3 h-3" /> SKU pesquisado: {sku || 'não informado'} (sem URL
                  cadastrada)
                </span>
              )}
            </div>

            {checkedAt && (
              <span className="font-mono text-[11px]">
                Verificado em: {new Date(checkedAt).toLocaleString('pt-BR')}
              </span>
            )}
          </div>

          {/* Botões de Ação: Rebate Fabricante e Aplicar Preço da B&H */}
          {(isBhRebateActive || canApplyPrice) && (
            <div className="pt-2 flex items-center justify-end gap-2 flex-wrap">
              {/* Botão Ativar / Editar Rebate Fabricante */}
              {isBhRebateActive && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsRebateModalOpen(true)}
                  className={cn(
                    'h-9 text-xs px-3 font-medium border-purple-500/40 shadow-sm transition-all',
                    existingRebateRule
                      ? 'bg-purple-500/20 text-purple-200 hover:bg-purple-500/30'
                      : 'bg-purple-600/10 hover:bg-purple-600/20 text-purple-300',
                  )}
                  title={
                    existingRebateRule
                      ? 'Editar vigência ou percentual da regra existente Rebate Fabricante'
                      : 'Ativar regra de desconto Rebate Fabricante na tabela discounts'
                  }
                >
                  <Tag className="w-4 h-4 mr-1.5" />
                  {existingRebateRule ? 'Editar Rebate' : 'Ativar Rebate Fabricante'}
                </Button>
              )}

              {/* Botão de Aplicar Preço da B&H */}
              {canApplyPrice && (
                <Button
                  type="button"
                  onClick={handleApplyPrice}
                  disabled={isApplying || isChecking}
                  className="bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111] font-semibold text-xs h-9 shadow transition-all"
                >
                  <ArrowRight className="w-4 h-4 mr-1.5" />
                  {isApplying
                    ? 'Atualizando preço...'
                    : `Aplicar preço da B&H (US$ ${targetApplyPrice?.toFixed(2)})`}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Configuração de Desconto: Rebate Fabricante */}
      <RebateDiscountModal
        isOpen={isRebateModalOpen}
        onClose={() => setIsRebateModalOpen(false)}
        product={modalProduct}
        existingRule={existingRebateRule}
        onSuccess={() => {
          loadExistingRebate()
          if (onRebateSaved) {
            onRebateSaved()
          }
        }}
      />
    </div>
  )
}
