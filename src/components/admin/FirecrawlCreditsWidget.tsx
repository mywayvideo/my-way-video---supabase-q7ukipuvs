import React, { useState, useEffect, useCallback } from 'react'
import {
  Flame,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  CloudOff,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { firecrawlCreditsService, FirecrawlCreditsData } from '@/services/firecrawlCreditsService'
import { cn } from '@/lib/utils'

interface FirecrawlCreditsWidgetProps {
  /**
   * 'compact': versão compacta em linha/banner (ideal para topo de catálogo ou páginas operacionais)
   * 'card': versão completa com título, barra de progresso destacada e métricas em grade
   */
  variant?: 'card' | 'compact'
  className?: string
  /**
   * Título customizado opcional
   */
  title?: string
}

export const FirecrawlCreditsWidget: React.FC<FirecrawlCreditsWidgetProps> = ({
  variant = 'card',
  className,
  title = 'Créditos Firecrawl (Scraping & Preços B&H)',
}) => {
  const [loading, setLoading] = useState<boolean>(true)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [data, setData] = useState<FirecrawlCreditsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadCredits = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const result = await firecrawlCreditsService.getCredits()
      setData(result)
      setError(null)
    } catch (err: unknown) {
      // Captura qualquer erro de rede / função não publicada / 404 / 500 sem quebrar o runtime da página
      const e = err as Error
      const rawMsg = e?.message || ''

      if (
        rawMsg.includes('não está publicada') ||
        rawMsg.includes('Failed to fetch') ||
        rawMsg.includes('NOT_FOUND') ||
        rawMsg.includes('indisponível')
      ) {
        setError(
          'Função firecrawl-credits não publicada no projeto Supabase. Faça o deploy da edge function para ativar a consulta automática.',
        )
      } else {
        setError(rawMsg || 'Não foi possível consultar os créditos do Firecrawl.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadCredits(false)
  }, [loadCredits])

  const formatNumber = (num?: number | null) => {
    if (num == null || isNaN(num)) return '0'
    return num.toLocaleString('pt-BR')
  }

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return ''
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return ''
    }
  }

  // Define criticidade de saldo
  const remaining = data?.remainingCredits ?? 0
  const total = data?.planCredits ?? 0
  const percentRemaining = data?.percentRemaining ?? 0
  const isCritical = total > 0 && percentRemaining < 10
  const isLow = total > 0 && percentRemaining < 25 && !isCritical
  const isNotDeployedError = Boolean(
    error &&
    (error.includes('não publicada') || error.includes('deploy') || error.includes('indisponível')),
  )

  // -------------------------------------------------------------
  // Variante 1: COMPACT (Banner horizontal minimalista para Catálogo)
  // -------------------------------------------------------------
  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'bg-card/80 border rounded-xl p-3 shadow-sm backdrop-blur-sm transition-all',
          error ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60',
          className,
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Lado Esquerdo: Ícone + Título + Status */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                error
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                  : 'bg-orange-500/10 border-orange-500/20 text-orange-500',
              )}
            >
              {error ? (
                <CloudOff className="w-4 h-4" />
              ) : (
                <Flame className="w-4 h-4 fill-orange-500/20" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground tracking-tight">
                  Créditos Firecrawl
                </span>
                {error && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 font-mono font-medium border bg-amber-500/10 text-amber-500 border-amber-500/30"
                  >
                    Função Pendente
                  </Badge>
                )}
                {data && !error && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] px-1.5 py-0 h-4 font-mono font-medium border',
                      isCritical
                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                        : isLow
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                    )}
                  >
                    {isCritical ? 'Crítico' : isLow ? 'Atenção' : 'Disponível'}
                  </Badge>
                )}
              </div>
              <p
                className={cn(
                  'text-[11px] truncate',
                  error
                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                    : 'text-muted-foreground',
                )}
                title={error || undefined}
              >
                {error
                  ? error
                  : loading
                    ? 'Consultando saldo...'
                    : `${formatNumber(data?.remainingCredits)} restantes de ${formatNumber(data?.planCredits)} créditos contratados`}
              </p>
            </div>
          </div>

          {/* Lado Direito: Métricas inline + Barra reduzida + Botão Atualizar */}
          <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
            {!loading && !error && data && (
              <div className="flex items-center gap-2 text-xs">
                <div className="text-right hidden sm:block">
                  <span className="font-mono font-bold text-foreground">
                    {formatNumber(data.remainingCredits)}
                  </span>
                  <span className="text-muted-foreground text-[11px]"> rest.</span>
                </div>
                <div className="w-20 sm:w-28 bg-muted/60 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-500',
                      isCritical
                        ? 'bg-red-500'
                        : isLow
                          ? 'bg-amber-500'
                          : 'bg-gradient-to-r from-orange-500 to-amber-500',
                    )}
                    style={{
                      width: `${Math.min(100, Math.max(0, data.percentRemaining))}%`,
                    }}
                    title={`${data.percentRemaining}% restantes`}
                  />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground min-w-[36px] text-right">
                  {data.percentRemaining}%
                </span>
              </div>
            )}

            {data?.fetchedAt && (
              <span
                className="text-[10px] text-muted-foreground/70 hidden md:inline-flex items-center gap-1 font-mono"
                title={`Última consulta: ${new Date(data.fetchedAt).toLocaleString('pt-BR')}`}
              >
                <Clock className="w-3 h-3" />
                {formatDateTime(data.fetchedAt)}
              </span>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadCredits(true)}
              disabled={loading || refreshing}
              className="h-7 px-2.5 text-xs border-border/70 hover:bg-muted/50"
              title="Atualizar saldo de créditos agora"
            >
              <RefreshCw
                className={cn('w-3 h-3 mr-1', (loading || refreshing) && 'animate-spin')}
              />
              <span className="text-[11px]">
                {loading || refreshing ? 'Atualizando...' : 'Atualizar'}
              </span>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------
  // Variante 2: CARD (Painel completo com métricas, barra e detalhes)
  // -------------------------------------------------------------
  return (
    <div
      className={cn(
        'bg-card border rounded-xl p-5 shadow-sm space-y-4 transition-all',
        error ? 'border-amber-500/40' : 'border-border/60',
        className,
      )}
    >
      {/* Cabeçalho do Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border',
              error
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                : 'bg-orange-500/10 border-orange-500/20 text-orange-500',
            )}
          >
            {error ? (
              <CloudOff className="w-5 h-5" />
            ) : (
              <Flame className="w-5 h-5 fill-orange-500/20" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base text-foreground tracking-tight">
                {title}
              </h3>
              {error && (
                <Badge
                  variant="outline"
                  className="text-xs font-mono font-medium border flex items-center gap-1 bg-amber-500/10 text-amber-500 border-amber-500/30"
                >
                  <AlertTriangle className="w-3 h-3" />
                  {isNotDeployedError ? 'Deploy Pendente' : 'Indisponível'}
                </Badge>
              )}
              {data && !error && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs font-mono font-medium border flex items-center gap-1',
                    isCritical
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : isLow
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                  )}
                >
                  {isCritical ? (
                    <>
                      <AlertCircle className="w-3 h-3" /> Saldo Crítico
                    </>
                  ) : isLow ? (
                    <>
                      <AlertTriangle className="w-3 h-3" /> Atenção Saldo Baixo
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> Operacional (OK)
                    </>
                  )}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Consumo de raspagem utilizado na verificação e atualização de preços B&H
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {data?.fetchedAt && (
            <span
              className="text-[11px] text-muted-foreground font-mono flex items-center gap-1"
              title={`Consulta em: ${new Date(data.fetchedAt).toLocaleString('pt-BR')}`}
            >
              <Clock className="w-3.5 h-3.5" />
              {formatDateTime(data.fetchedAt)}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadCredits(true)}
            disabled={loading || refreshing}
            className="h-8 text-xs border-border/70 hover:bg-muted/50"
          >
            <RefreshCw
              className={cn('w-3.5 h-3.5 mr-1.5', (loading || refreshing) && 'animate-spin')}
            />
            {loading || refreshing ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>
      </div>

      {/* Estado de Erro Degradado e Explicativo */}
      {error && (
        <div className="p-4 rounded-xl text-xs border bg-amber-500/10 text-amber-950 dark:text-amber-200 border-amber-500/30 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <span className="font-semibold block text-sm text-amber-900 dark:text-amber-100">
                Não foi possível consultar os créditos da API Firecrawl
              </span>
              <p className="text-amber-800/90 dark:text-amber-200/90 leading-relaxed">{error}</p>
            </div>
          </div>

          {isNotDeployedError && (
            <div className="pt-2 border-t border-amber-500/20 text-[11px] space-y-2 text-amber-900/90 dark:text-amber-200/80">
              <div className="font-medium text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                <span>Instruções para deploy no Supabase:</span>
              </div>
              <ol className="list-decimal pl-4 space-y-1">
                <li>
                  Acesse o <strong>Supabase Dashboard</strong> do projeto (
                  <code>ymlkyspcznrrmlktudxx</code>).
                </li>
                <li>
                  Vá em <strong>Edge Functions</strong> → clique em <strong>New Function</strong>{' '}
                  (ou selecione <code>firecrawl-credits</code>).
                </li>
                <li>
                  Nomeie a função como <code>firecrawl-credits</code>.
                </li>
                <li>
                  Copie o código do arquivo{' '}
                  <code>supabase/functions/firecrawl-credits/index.ts</code> do repositório e cole
                  no editor.
                </li>
                <li>
                  Clique em <strong>Deploy</strong>.
                </li>
              </ol>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadCredits(true)}
                  disabled={loading || refreshing}
                  className="h-7 text-xs bg-card/60 hover:bg-card border-amber-500/40"
                >
                  <RefreshCw
                    className={cn('w-3 h-3 mr-1.5', (loading || refreshing) && 'animate-spin')}
                  />
                  Tentar novamente após o deploy
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado Carregando Inicial */}
      {loading && !data && !error && (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
          <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
          <span>Consultando API Firecrawl...</span>
        </div>
      )}

      {/* Estado Sucesso com Métricas */}
      {data && !error && (
        <div className="space-y-4 pt-1">
          {/* Grid de Métricas Principais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Créditos Restantes */}
            <div className="p-3.5 bg-muted/40 rounded-lg border border-border/40">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                Créditos Restantes
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-orange-500">
                  {formatNumber(data.remainingCredits)}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  ({data.percentRemaining}%)
                </span>
              </div>
            </div>

            {/* Créditos Usados */}
            <div className="p-3.5 bg-muted/40 rounded-lg border border-border/40">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                Créditos Utilizados
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-foreground">
                  {formatNumber(data.usedCredits)}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  ({data.percentUsed}%)
                </span>
              </div>
            </div>

            {/* Limite do Plano */}
            <div className="p-3.5 bg-muted/40 rounded-lg border border-border/40">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                Limite do Plano
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-foreground">
                  {formatNumber(data.planCredits)}
                </span>
                <span className="text-xs text-muted-foreground">total</span>
              </div>
            </div>
          </div>

          {/* Barra de Progresso Visual de Consumo */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                Uso no período faturado
              </span>
              <span className="font-mono">
                {data.percentUsed}% consumidos · {data.percentRemaining}% livres
              </span>
            </div>
            <div className="w-full bg-muted/70 rounded-full h-2.5 overflow-hidden flex">
              <div
                className="bg-muted-foreground/30 transition-all duration-500 h-full"
                style={{ width: `${Math.min(100, Math.max(0, data.percentUsed))}%` }}
                title={`${formatNumber(data.usedCredits)} créditos utilizados`}
              />
              <div
                className={cn(
                  'transition-all duration-500 h-full',
                  isCritical
                    ? 'bg-red-500'
                    : isLow
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-orange-500 to-amber-500',
                )}
                style={{ width: `${Math.min(100, Math.max(0, data.percentRemaining))}%` }}
                title={`${formatNumber(data.remainingCredits)} créditos disponíveis`}
              />
            </div>
          </div>

          {/* Detalhes do Ciclo de Faturamento se presentes */}
          {(data.billingPeriodStart || data.billingPeriodEnd) && (
            <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 font-mono">
              {data.billingPeriodStart && (
                <span>
                  Início do ciclo: {new Date(data.billingPeriodStart).toLocaleDateString('pt-BR')}
                </span>
              )}
              {data.billingPeriodEnd && (
                <span>
                  Renovação: {new Date(data.billingPeriodEnd).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
