import React, { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import {
  priceCheckService,
  PriceCheckResult,
  PriceCheckRecord,
  PriceCheckStatus,
} from '@/services/priceCheckService'

interface BhPriceCheckerProps {
  productId: string
  currentPriceUsd: number | null | undefined
  websiteUrl: string | null | undefined
  sku: string | null | undefined
  onPriceUpdated?: () => void
  onPriceApplied?: (appliedPrice: number) => void
  onUrlDiscovered?: (newUrl: string) => void
}

export const BhPriceChecker: React.FC<BhPriceCheckerProps> = ({
  productId,
  currentPriceUsd,
  websiteUrl,
  sku,
  onPriceUpdated,
  onPriceApplied,
  onUrlDiscovered,
}) => {
  const [isChecking, setIsChecking] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [lastRecord, setLastRecord] = useState<PriceCheckRecord | null>(null)
  const [currentResult, setCurrentResult] = useState<PriceCheckResult | null>(null)

  useEffect(() => {
    let mounted = true
    if (productId) {
      priceCheckService.getLatestCheck(productId).then((rec) => {
        if (mounted && rec) {
          setLastRecord(rec)
        }
      })
    }
    return () => {
      mounted = false
    }
  }, [productId])

  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const res = await priceCheckService.checkBhPrice(productId)
      setCurrentResult(res)

      // Atualiza o registro visual
      setLastRecord({
        id: 'latest',
        product_id: productId,
        checked_at: res.checked_at || new Date().toISOString(),
        price_db: res.price_usd_cadastrado ?? currentPriceUsd ?? null,
        price_bh: res.price_bh ?? null,
        diff_usd: res.diff_usd ?? null,
        diff_pct: res.diff_pct ?? null,
        status: res.status,
        source: 'manual',
        url_used: res.url_used ?? null,
        url_discovered: !!res.url_discovered,
        message: res.message || null,
      })

      if (res.status === 'ok') {
        toast({
          title: 'Preço B&H conferido!',
          description: res.message || 'O preço cadastrado está dentro da tolerância acordada.',
        })
      } else if (res.status === 'divergente') {
        toast({
          title: 'Divergência detectada!',
          description:
            res.message || 'O preço na B&H difere do cadastrado além da tolerância permitida.',
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
    const targetPrice = currentResult?.price_bh ?? lastRecord?.price_bh
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

  const canApplyPrice =
    displayPriceBh != null &&
    displayPriceBh > 0 &&
    (activeStatus === 'divergente' || (displayPriceDb != null && displayPriceDb !== displayPriceBh))

  const renderStatusBadge = () => {
    switch (activeStatus) {
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
      {activeStatus && (
        <div className="mt-4 pt-1 space-y-4">
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

          {/* Mensagem e aviso */}
          {displayMessage && (
            <div
              className={`p-3 rounded-lg text-xs leading-relaxed border flex items-start gap-2.5 ${
                activeStatus === 'ok'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  : activeStatus === 'divergente'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                    : activeStatus === 'descontinuado'
                      ? 'bg-red-500/10 text-red-300 border-red-500/20'
                      : 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
              }`}
            >
              {activeStatus === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : activeStatus === 'divergente' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : activeStatus === 'descontinuado' ? (
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <HelpCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span>{displayMessage}</span>
                {activeStatus === 'sem_url_confirmada' && (
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

          {/* Botão de Aplicar Preço da B&H */}
          {canApplyPrice && (
            <div className="pt-2 flex justify-end">
              <Button
                onClick={handleApplyPrice}
                disabled={isApplying || isChecking}
                className="bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111] font-semibold text-xs h-9 shadow transition-all"
              >
                <ArrowRight className="w-4 h-4 mr-1.5" />
                {isApplying
                  ? 'Atualizando preço...'
                  : `Aplicar preço da B&H (US$ ${displayPriceBh?.toFixed(2)})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
