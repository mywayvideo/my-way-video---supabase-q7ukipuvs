import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  RefreshCw,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Filter,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Tag,
  ArrowRight,
  TrendingDown,
  Clock,
  Sparkles,
  Info,
  Layers,
  ChevronLeft,
} from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import {
  priceCheckService,
  PriceCheckRecord,
  PriceCheckStatus,
  PriceChecksSummaryStats,
  extractRebateInfo,
  evaluatePairedPrices,
} from '@/services/priceCheckService'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<
  PriceCheckStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ok: {
    label: 'Preço OK',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: CheckCircle2,
  },
  divergente: {
    label: 'Divergente',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: AlertTriangle,
  },
  descontinuado: {
    label: 'Descontinuado',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
    icon: XCircle,
  },
  sem_url_confirmada: {
    label: 'Sem URL Confirmada',
    className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    icon: HelpCircle,
  },
  erro: {
    label: 'Erro / Falha',
    className: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    icon: XCircle,
  },
}

const PAGE_SIZE = 30

export function AdminPriceChecksPage() {
  const [records, setRecords] = useState<PriceCheckRecord[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [page, setPage] = useState<number>(1)

  // Filtros
  const [search, setSearch] = useState<string>('')
  const debouncedSearch = useDebounce(search, 350)
  const [selectedStatuses, setSelectedStatuses] = useState<PriceCheckStatus[]>([])
  const [selectedSource, setSelectedSource] = useState<'all' | 'manual' | 'batch'>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Linhas expandidas para exibição do detalhe pareado
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Referências para sincronização das barras de rolagem horizontal (superior e inferior/tabela)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const topTrackRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const [isDraggingTop, setIsDraggingTop] = useState(false)
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollLeft: 0,
    scrollWidth: 1200,
    clientWidth: 0,
  })
  const topDragStartRef = useRef<{
    startX: number
    scrollLeft: number
    maxScroll: number
    trackTravel: number
  }>({ startX: 0, scrollLeft: 0, maxScroll: 0, trackTravel: 0 })

  // Obtém o elemento de scroll real da tabela (div wrapper gerado pelo componente Table)
  const getTableScrollElement = useCallback((): HTMLElement | null => {
    const container = bottomScrollRef.current
    if (!container) return null
    const innerWrapper = container.querySelector<HTMLElement>('.relative.w-full.overflow-auto')
    if (innerWrapper) return innerWrapper
    const firstChild = container.firstElementChild as HTMLElement | null
    if (firstChild && firstChild.tagName === 'DIV') return firstChild
    return container
  }, [])

  // Helpers para atualização de métricas de scroll
  const updateMetricsFromTable = useCallback(() => {
    const tableEl = getTableScrollElement()
    if (!tableEl) return
    setScrollMetrics({
      scrollLeft: tableEl.scrollLeft,
      scrollWidth: tableEl.scrollWidth,
      clientWidth: tableEl.clientWidth,
    })
  }, [getTableScrollElement])

  // Resumo mensal dos cards superiores
  const [summary, setSummary] = useState<PriceChecksSummaryStats>({
    monthCount: 0,
    divergentCount: 0,
    discontinuedCount: 0,
    withoutUrlCount: 0,
    errorCount: 0,
    totalFiltered: 0,
  })
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true)

  // Carregar dados de resumo mensal
  const loadSummary = useCallback(async () => {
    setLoadingSummary(true)
    try {
      const stats = await priceCheckService.fetchMonthlySummary()
      setSummary(stats)
    } catch (err: any) {
      console.warn('Erro ao carregar resumo de verificações:', err)
    } finally {
      setLoadingSummary(false)
    }
  }, [])

  // Carregar histórico com filtros
  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await priceCheckService.fetchPriceChecksHistory({
        page,
        pageSize: PAGE_SIZE,
        statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
        source: selectedSource,
        startDate: startDate || null,
        endDate: endDate || null,
        search: debouncedSearch,
      })
      setRecords(res.data)
      setTotalCount(res.totalCount)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar histórico',
        description: err.message || 'Falha ao buscar verificações de preços.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [page, selectedStatuses, selectedSource, startDate, endDate, debouncedSearch])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Resetar página ao mudar filtros
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedStatuses, selectedSource, startDate, endDate])

  // Atualizar as métricas de rolagem e sincronizar listeners no elemento de tabela real
  useEffect(() => {
    const tableEl = getTableScrollElement()
    const topEl = topScrollRef.current
    if (!tableEl) return

    // Ocultar barra nativa do wrapper interno da Table, mantendo overflow habilitado
    tableEl.classList.add(
      '[scrollbar-width:none]',
      '[-ms-overflow-style:none]',
      '[&::-webkit-scrollbar]:hidden',
    )

    let isSyncingTop = false
    let isSyncingBottom = false

    const onTableScrollListener = () => {
      if (isSyncingBottom) {
        isSyncingBottom = false
        return
      }
      isSyncingTop = true
      if (topEl) {
        topEl.scrollLeft = tableEl.scrollLeft
      }
      updateMetricsFromTable()
    }

    const onTopScrollListener = () => {
      if (isSyncingTop) {
        isSyncingTop = false
        return
      }
      isSyncingBottom = true
      tableEl.scrollLeft = topEl ? topEl.scrollLeft : 0
      updateMetricsFromTable()
    }

    tableEl.addEventListener('scroll', onTableScrollListener, { passive: true })
    if (topEl) {
      topEl.addEventListener('scroll', onTopScrollListener, { passive: true })
    }

    updateMetricsFromTable()

    const observer = new ResizeObserver(() => {
      updateMetricsFromTable()
    })

    observer.observe(tableEl)
    const tableChild = tableEl.querySelector('table')
    if (tableChild) {
      observer.observe(tableChild)
    }
    if (bottomScrollRef.current && bottomScrollRef.current !== tableEl) {
      observer.observe(bottomScrollRef.current)
    }

    return () => {
      tableEl.removeEventListener('scroll', onTableScrollListener)
      if (topEl) {
        topEl.removeEventListener('scroll', onTopScrollListener)
      }
      observer.disconnect()
    }
  }, [records, getTableScrollElement, updateMetricsFromTable])

  // Drag handlers para a barra de rolagem horizontal superior via Pointer Events (arrastar o thumb)
  const handleTopPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const tableEl = getTableScrollElement()
    const trackEl = topTrackRef.current
    if (!tableEl || !trackEl) return

    const { scrollWidth, clientWidth, scrollLeft } = scrollMetrics
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    if (maxScroll <= 0) return

    const trackWidth = trackEl.clientWidth
    const ratio = clientWidth / scrollWidth
    const thumbWidth = Math.max(56, Math.min(trackWidth, trackWidth * ratio))
    const trackTravel = trackWidth - thumbWidth
    if (trackTravel <= 0) return

    e.currentTarget.setPointerCapture(e.pointerId)
    topDragStartRef.current = {
      startX: e.clientX,
      scrollLeft,
      maxScroll,
      trackTravel,
    }
    setIsDraggingTop(true)
  }

  const handleTopPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingTop) return
    const tableEl = getTableScrollElement()
    if (!tableEl) return

    const { startX, scrollLeft, maxScroll, trackTravel } = topDragStartRef.current
    if (trackTravel <= 0 || maxScroll <= 0) return

    const deltaX = e.clientX - startX
    const scrollDelta = (deltaX / trackTravel) * maxScroll
    const newScrollLeft = Math.max(0, Math.min(maxScroll, scrollLeft + scrollDelta))

    tableEl.scrollLeft = newScrollLeft
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = newScrollLeft
    }
    setScrollMetrics((prev) => ({ ...prev, scrollLeft: newScrollLeft }))
  }

  const handleTopPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingTop) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setIsDraggingTop(false)
  }

  // Clique direto no trilho da barra superior
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const trackEl = topTrackRef.current
    if (!trackEl) return
    const tableEl = getTableScrollElement()
    if (!tableEl) return

    const { scrollWidth, clientWidth } = scrollMetrics
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    if (maxScroll <= 0) return

    const rect = trackEl.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const trackWidth = rect.width
    const ratio = clientWidth / scrollWidth
    const thumbWidth = Math.max(56, Math.min(trackWidth, trackWidth * ratio))

    const targetThumbLeft = Math.max(0, Math.min(trackWidth - thumbWidth, clickX - thumbWidth / 2))
    const trackTravel = trackWidth - thumbWidth
    const newScrollLeft = trackTravel > 0 ? (targetThumbLeft / trackTravel) * maxScroll : 0

    tableEl.scrollTo({ left: newScrollLeft, behavior: 'smooth' })
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = newScrollLeft
    }
    setScrollMetrics((prev) => ({ ...prev, scrollLeft: newScrollLeft }))
  }

  // Botões de passo horizontal (setas ◀ e ▶)
  const handleStepScroll = (direction: 'left' | 'right') => {
    const tableEl = getTableScrollElement()
    if (!tableEl) return
    const step = 280
    const targetLeft = direction === 'left' ? tableEl.scrollLeft - step : tableEl.scrollLeft + step
    tableEl.scrollTo({ left: targetLeft, behavior: 'smooth' })
    if (topScrollRef.current) {
      topScrollRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' })
    }
  }

  const canScrollHorizontally =
    scrollMetrics.scrollWidth > scrollMetrics.clientWidth && scrollMetrics.clientWidth > 0

  const getThumbStyle = () => {
    const trackEl = topTrackRef.current
    const trackWidth = trackEl?.clientWidth || 0
    if (!canScrollHorizontally || trackWidth <= 0) {
      return { width: '100%', left: '0px', display: 'none' }
    }
    const { scrollLeft, scrollWidth, clientWidth } = scrollMetrics
    const maxScroll = Math.max(1, scrollWidth - clientWidth)
    const ratio = clientWidth / scrollWidth
    const thumbWidth = Math.max(56, Math.min(trackWidth, trackWidth * ratio))
    const trackTravel = trackWidth - thumbWidth
    const thumbLeft = Math.max(0, Math.min(trackTravel, (scrollLeft / maxScroll) * trackTravel))

    return {
      width: `${thumbWidth}px`,
      transform: `translateX(${thumbLeft}px)`,
      left: 0,
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleStatusFilter = (status: PriceCheckStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    )
  }

  const clearAllFilters = () => {
    setSearch('')
    setSelectedStatuses([])
    setSelectedSource('all')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  const hasActiveFilters =
    Boolean(search.trim()) ||
    selectedStatuses.length > 0 ||
    selectedSource !== 'all' ||
    Boolean(startDate) ||
    Boolean(endDate)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1

  return (
    <AdminLayout breadcrumb="Verificação de Preços">
      <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/50">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-primary" />
              Verificação de Preços B&H
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Histórico consolidado de auditorias de preços (execuções manuais e em lote),
              comparativos pareados com rebate de fabricante e vigências.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadSummary()
                loadHistory()
              }}
              disabled={loading}
              className="gap-2 bg-card/60"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              Atualizar
            </Button>
            <Button asChild size="sm" className="gap-2 bg-primary text-primary-foreground">
              <Link to="/admin/bh-update">
                <ArrowRight className="w-4 h-4" />
                Painel Atualização B&H
              </Link>
            </Button>
          </div>
        </div>

        {/* Resumo no Topo (Cards com métricas do mês corrente) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="bg-card/70 border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Auditorias no Mês
                </p>
                <div className="text-2xl font-bold font-mono text-foreground mt-1">
                  {loadingSummary ? '—' : summary.monthCount.toLocaleString('pt-BR')}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">mês corrente</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => {
              setSelectedStatuses(['divergente'])
            }}
            className={cn(
              'bg-card/70 border-border/50 shadow-sm cursor-pointer transition-colors hover:border-amber-500/50',
              selectedStatuses.length === 1 &&
                selectedStatuses[0] === 'divergente' &&
                'ring-1 ring-amber-500',
            )}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-400 uppercase tracking-wider">
                  Divergentes
                </p>
                <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                  {loadingSummary ? '—' : summary.divergentCount.toLocaleString('pt-BR')}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  diferença &gt; 1% ou US$1
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => {
              setSelectedStatuses(['descontinuado'])
            }}
            className={cn(
              'bg-card/70 border-border/50 shadow-sm cursor-pointer transition-colors hover:border-red-500/50',
              selectedStatuses.length === 1 &&
                selectedStatuses[0] === 'descontinuado' &&
                'ring-1 ring-red-500',
            )}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-400 uppercase tracking-wider">
                  Descontinuados
                </p>
                <div className="text-2xl font-bold font-mono text-red-400 mt-1">
                  {loadingSummary ? '—' : summary.discontinuedCount.toLocaleString('pt-BR')}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">sinalizados na B&H</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => {
              setSelectedStatuses(['sem_url_confirmada'])
            }}
            className={cn(
              'bg-card/70 border-border/50 shadow-sm cursor-pointer transition-colors hover:border-yellow-500/50',
              selectedStatuses.length === 1 &&
                selectedStatuses[0] === 'sem_url_confirmada' &&
                'ring-1 ring-yellow-500',
            )}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-yellow-400 uppercase tracking-wider">
                  Sem URL Confirmada
                </p>
                <div className="text-2xl font-bold font-mono text-yellow-400 mt-1">
                  {loadingSummary ? '—' : summary.withoutUrlCount.toLocaleString('pt-BR')}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">requer link manual</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 text-yellow-400 flex items-center justify-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => {
              setSelectedStatuses(['erro'])
            }}
            className={cn(
              'bg-card/70 border-border/50 shadow-sm cursor-pointer transition-colors hover:border-rose-500/50',
              selectedStatuses.length === 1 &&
                selectedStatuses[0] === 'erro' &&
                'ring-1 ring-rose-500',
            )}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-rose-400 uppercase tracking-wider">
                  Erros / Falhas
                </p>
                <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
                  {loadingSummary ? '—' : summary.errorCount.toLocaleString('pt-BR')}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">falhas na raspagem</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Barra de Filtros */}
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Busca textual */}
            <div className="md:col-span-4 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por produto, SKU ou mensagem..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50 border-border/50 text-sm h-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtro Multi-seleção por Status via Popover */}
            <div className="md:col-span-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between h-9 bg-background/50 border-border/50 text-xs font-normal"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                      {selectedStatuses.length === 0
                        ? 'Todos os status'
                        : `${selectedStatuses.length} status selecionado(s)`}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 bg-popover border-border/80" align="start">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground pb-1 border-b border-border/50">
                      Filtrar por Status
                    </p>
                    {(Object.keys(STATUS_CONFIG) as PriceCheckStatus[]).map((status) => {
                      const cfg = STATUS_CONFIG[status]
                      const isChecked = selectedStatuses.includes(status)
                      return (
                        <label
                          key={status}
                          className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer hover:bg-muted/50 p-1 rounded"
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleStatusFilter(status)}
                          />
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] py-0', cfg.className)}
                          >
                            {cfg.label}
                          </Badge>
                        </label>
                      )
                    })}
                    {selectedStatuses.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedStatuses([])}
                        className="w-full text-xs h-7 mt-2 text-muted-foreground"
                      >
                        Limpar seleção
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtro por Fonte (Manual / Batch / Todas) */}
            <div className="md:col-span-2">
              <Select
                value={selectedSource}
                onValueChange={(val: 'all' | 'manual' | 'batch') => setSelectedSource(val)}
              >
                <SelectTrigger className="h-9 text-xs bg-background/50 border-border/50">
                  <SelectValue placeholder="Fonte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as fontes</SelectItem>
                  <SelectItem value="batch">Lote (Batch)</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Período de Datas */}
            <div className="md:col-span-3 flex items-center gap-1.5">
              <div className="relative flex-1">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 text-xs bg-background/50 border-border/50 px-2 font-mono"
                  title="Data Inicial"
                />
              </div>
              <span className="text-xs text-muted-foreground">até</span>
              <div className="relative flex-1">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-xs bg-background/50 border-border/50 px-2 font-mono"
                  title="Data Final"
                />
              </div>
            </div>
          </div>

          {/* Indicadores de Filtros Ativos e Limpar */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>Filtros ativos:</span>
                {selectedStatuses.map((st) => (
                  <Badge
                    key={st}
                    variant="outline"
                    className="text-[10px] gap-1 bg-muted/60 cursor-pointer"
                    onClick={() => toggleStatusFilter(st)}
                  >
                    {STATUS_CONFIG[st]?.label}
                    <span className="opacity-60">✕</span>
                  </Badge>
                ))}
                {selectedSource !== 'all' && (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 bg-muted/60 cursor-pointer"
                    onClick={() => setSelectedSource('all')}
                  >
                    Fonte: {selectedSource}
                    <span className="opacity-60">✕</span>
                  </Badge>
                )}
                {(startDate || endDate) && (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 bg-muted/60 cursor-pointer"
                    onClick={() => {
                      setStartDate('')
                      setEndDate('')
                    }}
                  >
                    Período: {startDate || '—'} a {endDate || '—'}
                    <span className="opacity-60">✕</span>
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
              >
                Limpar todos
              </Button>
            </div>
          )}
        </div>

        {/* Listagem de Verificações */}
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3.5 border-b border-border/50 bg-muted/20 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">
              {loading ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando histórico...
                </span>
              ) : (
                <>
                  Total: <strong className="font-mono text-primary">{totalCount}</strong>{' '}
                  verificações encontradas
                </>
              )}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Página {page} de {totalPages}
            </span>
          </div>

          {/* Barra de rolagem horizontal superior sincronizada com a tabela */}
          <div
            className="relative w-full border-b border-border/60 bg-muted/40 select-none transition-colors hover:bg-muted/50 flex items-center px-1"
            style={{ height: '22px' }}
            aria-label="Barra de rolagem horizontal superior da tabela"
          >
            {/* Botão de rolagem para esquerda ◀ */}
            <button
              type="button"
              onClick={() => handleStepScroll('left')}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 active:scale-95 transition-all cursor-pointer mr-1 z-10"
              title="Rolar tabela para a esquerda (◀)"
              aria-label="Rolar para a esquerda"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Contêiner nativo invisível espelhado para manter sincronização por eventos de scroll nativos */}
            <div
              ref={topScrollRef}
              className="absolute inset-0 overflow-x-auto overflow-y-hidden opacity-0 pointer-events-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              tabIndex={-1}
            >
              <div
                style={{
                  width:
                    scrollMetrics.scrollWidth > 0 ? `${scrollMetrics.scrollWidth}px` : '1200px',
                  height: '1px',
                }}
              />
            </div>

            {/* Trilho visual interativo */}
            <div
              ref={topTrackRef}
              onClick={handleTrackClick}
              className="relative flex-1 h-full cursor-pointer flex items-center"
              title="Clique ou arraste a pegada para rolar a tabela horizontalmente"
            >
              {/* Linha guia do trilho no tema escuro */}
              <div className="absolute left-0 right-0 h-2.5 bg-slate-900/90 border border-slate-700/80 rounded-full shadow-inner" />

              {/* Pegada (Thumb) visível em destaque no tema escuro com suporte a drag */}
              {canScrollHorizontally && (
                <div
                  onPointerDown={handleTopPointerDown}
                  onPointerMove={handleTopPointerMove}
                  onPointerUp={handleTopPointerUp}
                  onPointerCancel={handleTopPointerUp}
                  style={getThumbStyle()}
                  className={cn(
                    'absolute h-4 rounded-full cursor-grab active:cursor-grabbing transition-[filter,transform] duration-75 shadow-md z-10 flex items-center justify-center touch-none',
                    'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 active:brightness-125 shadow-[0_1px_8px_rgba(245,158,11,0.55)] border border-amber-300/60',
                    isDraggingTop &&
                      'scale-y-110 brightness-125 shadow-[0_2px_10px_rgba(245,158,11,0.75)]',
                  )}
                >
                  <div className="flex gap-0.5 pointer-events-none opacity-85">
                    <div className="w-0.5 h-2 bg-amber-950/80 rounded-full" />
                    <div className="w-0.5 h-2 bg-amber-950/80 rounded-full" />
                    <div className="w-0.5 h-2 bg-amber-950/80 rounded-full" />
                  </div>
                </div>
              )}
            </div>

            {/* Botão de rolagem para direita ▶ */}
            <button
              type="button"
              onClick={() => handleStepScroll('right')}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 active:scale-95 transition-all cursor-pointer ml-1 z-10"
              title="Rolar tabela para a direita (▶)"
              aria-label="Rolar para a direita"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            ref={bottomScrollRef}
            className="w-full overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-muted/30 [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-500"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#64748b #1e293b',
            }}
          >
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border/50">
                  <TableHead className="w-10 text-center table-sticky-col-header"></TableHead>
                  <TableHead className="bh-product-name-col table-sticky-col-header-2 font-semibold text-xs">
                    Produto
                  </TableHead>
                  <TableHead className="w-40 font-semibold text-xs">Data da Checagem</TableHead>
                  <TableHead className="w-32 font-semibold text-xs">Status</TableHead>
                  <TableHead className="w-36 font-semibold text-xs">Rebate Ativo</TableHead>
                  <TableHead className="text-right w-28 font-semibold text-xs">Price DB</TableHead>
                  <TableHead className="text-right w-28 font-semibold text-xs">Price B&H</TableHead>
                  <TableHead className="text-right w-32 font-semibold text-xs">Diferença</TableHead>
                  <TableHead className="w-24 text-center font-semibold text-xs">Fonte</TableHead>
                  <TableHead className="min-w-[200px] font-semibold text-xs">URL B&H</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((rec) => {
                  const isExpanded = expandedIds.has(rec.id)
                  const statusCfg = STATUS_CONFIG[rec.status] || STATUS_CONFIG.ok
                  const StatusIcon = statusCfg.icon

                  // Extrai rebate_info do JSON raw se existir
                  const rebateInfo = extractRebateInfo({
                    raw: rec.raw,
                    message: rec.message,
                    catalogPriceUsd: rec.price_db,
                  })

                  // Avalia se há rebate do produto (products.price_usa_rebate > 0 e date_rebate futuro/nulo)
                  const product = rec.product
                  const nativeRebatePrice = product?.price_usa_rebate
                    ? Number(product.price_usa_rebate)
                    : null
                  const nativeDateRebate = product?.date_rebate
                  const now = new Date()
                  const isNativeExpired = nativeDateRebate
                    ? new Date(nativeDateRebate) < now
                    : false
                  const hasNativeRebate = nativeRebatePrice != null && nativeRebatePrice > 0

                  // Avaliação pareada para a visão expandida
                  const pairedEval = evaluatePairedPrices({
                    catalogPriceUsd: rec.price_db ?? product?.price_usd ?? null,
                    catalogPriceRebate: nativeRebatePrice,
                    catalogDateRebate: nativeDateRebate,
                    bhPrice: rec.price_bh,
                    bhPriceFull: rebateInfo.rebatePriceFull,
                    bhPriceWithRebate: rebateInfo.rebatePriceWithDiscount,
                    bhRebateActive: rebateInfo.isBhRebateActive,
                  })

                  const diffUsd = rec.diff_usd
                  const diffPct = rec.diff_pct

                  return (
                    <React.Fragment key={rec.id}>
                      <TableRow
                        className={cn(
                          'group transition-colors border-b border-border/40 hover:bg-muted/40 cursor-pointer',
                          isExpanded && 'bg-muted/30',
                        )}
                        onClick={() => toggleExpand(rec.id)}
                      >
                        {/* Botão Expandir - Coluna 1 Fixa */}
                        <TableCell className="text-center p-2 table-sticky-col-cell">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground group-hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpand(rec.id)
                            }}
                            title={
                              isExpanded ? 'Recolher detalhes' : 'Expandir visão pareada e rebate'
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-primary" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </Button>
                        </TableCell>

                        {/* Produto (Nome + link para /products/edit/:id) - Coluna 2 Fixa */}
                        <TableCell className="bh-product-name-col table-sticky-col-cell-2">
                          <div className="flex flex-col min-w-0 pr-2 overflow-hidden">
                            {product ? (
                              <Link
                                to={`/products/edit/${product.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-medium text-foreground text-sm hover:text-primary hover:underline truncate block"
                                title={product.name}
                              >
                                {product.name}
                              </Link>
                            ) : (
                              <span
                                className="font-medium text-foreground text-sm truncate block"
                                title={`Produto ${rec.product_id}`}
                              >
                                Produto {rec.product_id.slice(0, 8)}...
                              </span>
                            )}
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 truncate">
                              {product?.sku ? (
                                <span className="font-mono truncate">{product.sku}</span>
                              ) : (
                                <span className="font-mono text-muted-foreground/60">Sem SKU</span>
                              )}
                              {product?.is_discontinued && (
                                <Badge
                                  variant="destructive"
                                  className="text-[9px] py-0 px-1 uppercase shrink-0"
                                >
                                  Inativo
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Data da Checagem */}
                        <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {rec.checked_at ? (
                            <div className="flex flex-col">
                              <span className="text-foreground font-medium">
                                {new Date(rec.checked_at).toLocaleDateString('pt-BR')}
                              </span>
                              <span className="text-[11px] text-muted-foreground/80">
                                {new Date(rec.checked_at).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[11px] font-medium gap-1 px-2 py-0.5',
                              statusCfg.className,
                            )}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusCfg.label}
                          </Badge>
                        </TableCell>

                        {/* Indicador "Rebate Ativo" por linha (campos nativos do produto) */}
                        <TableCell className="whitespace-nowrap">
                          {hasNativeRebate ? (
                            isNativeExpired ? (
                              <Badge
                                variant="outline"
                                className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] font-mono"
                                title={`Rebate anterior expirou em ${nativeDateRebate ? new Date(nativeDateRebate).toLocaleDateString('pt-BR') : ''}`}
                              >
                                Expirado
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-purple-500/15 text-purple-300 border-purple-500/40 text-[11px] font-mono flex items-center gap-1 py-0.5"
                                title={`Válido até: ${nativeDateRebate ? new Date(nativeDateRebate).toLocaleDateString('pt-BR') : 'Indeterminado'}`}
                              >
                                <Tag className="w-3 h-3 text-purple-400" />
                                <span>US$ {nativeRebatePrice?.toFixed(2)}</span>
                                {nativeDateRebate && (
                                  <span className="text-[9px] text-purple-300/80 ml-0.5">
                                    até {new Date(nativeDateRebate).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </Badge>
                            )
                          ) : (
                            <span className="text-muted-foreground/40 font-mono text-xs">—</span>
                          )}
                        </TableCell>

                        {/* Price DB */}
                        <TableCell className="text-right font-mono text-xs text-foreground font-medium">
                          {rec.price_db != null ? `US$ ${Number(rec.price_db).toFixed(2)}` : '—'}
                        </TableCell>

                        {/* Price B&H */}
                        <TableCell className="text-right font-mono text-xs font-semibold text-emerald-400">
                          {rec.price_bh != null ? `US$ ${Number(rec.price_bh).toFixed(2)}` : '—'}
                        </TableCell>

                        {/* Diferença (diff_usd e diff_pct) */}
                        <TableCell className="text-right font-mono text-xs">
                          {diffUsd != null && diffUsd !== 0 ? (
                            <div className="flex flex-col items-end">
                              <span
                                className={cn(
                                  'font-semibold',
                                  diffUsd > 0 ? 'text-amber-400' : 'text-blue-400',
                                )}
                              >
                                {diffUsd > 0 ? '+' : ''}US$ {Number(diffUsd).toFixed(2)}
                              </span>
                              {diffPct != null && (
                                <span className="text-[10px] text-muted-foreground">
                                  {diffPct > 0 ? '+' : ''}
                                  {Number(diffPct).toFixed(1)}%
                                </span>
                              )}
                            </div>
                          ) : rec.price_bh != null ? (
                            <span className="text-emerald-400 font-semibold">0.00</span>
                          ) : (
                            '—'
                          )}
                        </TableCell>

                        {/* Fonte (Manual / Batch) */}
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px] uppercase font-mono px-1.5 py-0',
                              rec.source === 'batch'
                                ? 'bg-slate-800 text-slate-300'
                                : 'bg-blue-500/10 text-blue-300 border-blue-500/20',
                            )}
                          >
                            {rec.source === 'batch' ? 'Lote' : 'Manual'}
                          </Badge>
                        </TableCell>

                        {/* URL da B&H usada (link externo com indicador url_discovered) */}
                        <TableCell className="text-xs">
                          {rec.url_used ? (
                            <div className="flex items-center gap-1.5 max-w-[260px]">
                              <a
                                href={rec.url_used}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:underline font-mono text-xs truncate flex items-center gap-1"
                                title={rec.url_used}
                              >
                                <span className="truncate">{rec.url_used}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                              {rec.url_discovered && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/30 shrink-0 py-0 px-1"
                                  title="URL descoberta e confirmada automaticamente por MFR #"
                                >
                                  MFR #
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50 italic text-xs">
                              Não informada
                            </span>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Visão do Resultado Pareado Expandido */}
                      {isExpanded && (
                        <TableRow className="bg-slate-950/60 border-b border-border/60">
                          <TableCell colSpan={10} className="p-4 pl-12">
                            <div className="space-y-3 max-w-5xl rounded-lg bg-card/60 border border-border/50 p-4">
                              {/* Título e Mensagem Registrada */}
                              <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-2">
                                <div>
                                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-primary" />
                                    Detalhamento da Verificação
                                    {pairedEval.mode === 'paired' && (
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'text-[10px] font-mono py-0',
                                          pairedEval.overallWithinTolerance
                                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                            : 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                                        )}
                                      >
                                        Avaliação Pareada (Cheio × Cheio / Desconto × Desconto)
                                      </Badge>
                                    )}
                                  </h4>
                                  {rec.message && (
                                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                                      <strong className="text-foreground/80 font-sans">
                                        Mensagem:
                                      </strong>{' '}
                                      {rec.message}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="outline" className="text-xs font-mono shrink-0">
                                  ID: {rec.id.slice(0, 8)}
                                </Badge>
                              </div>

                              {/* Os dois pares: Cheio × Cheio e Desconto × Desconto */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                {/* Par Cheio × Cheio */}
                                <div className="p-3 rounded-md bg-background/50 border border-border/40 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                      <span>Preço Cheio (FOB Miami × B&H Regular)</span>
                                    </span>
                                    {pairedEval.fullPair ? (
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'text-[10px] font-mono',
                                          pairedEval.fullPair.isWithinTolerance
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                                        )}
                                      >
                                        {pairedEval.fullPair.isWithinTolerance
                                          ? 'OK'
                                          : 'Divergente'}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                    <div>
                                      <span className="text-muted-foreground block text-[11px]">
                                        Cadastrado (DB):
                                      </span>
                                      <span className="font-semibold text-foreground">
                                        {rec.price_db != null
                                          ? `US$ ${Number(rec.price_db).toFixed(2)}`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block text-[11px]">
                                        B&H Regular:
                                      </span>
                                      <span className="font-semibold text-foreground">
                                        {rebateInfo.rebatePriceFull != null
                                          ? `US$ ${Number(rebateInfo.rebatePriceFull).toFixed(2)}`
                                          : rec.price_bh != null
                                            ? `US$ ${Number(rec.price_bh).toFixed(2)}`
                                            : '—'}
                                      </span>
                                    </div>
                                  </div>
                                  {pairedEval.fullPair?.diffUsd != null && (
                                    <div className="text-[11px] font-mono pt-1 border-t border-border/30 flex justify-between text-muted-foreground">
                                      <span>Diferença:</span>
                                      <span
                                        className={cn(
                                          pairedEval.fullPair.diffUsd > 0
                                            ? 'text-amber-400'
                                            : 'text-blue-400',
                                        )}
                                      >
                                        {pairedEval.fullPair.diffUsd > 0 ? '+' : ''}US${' '}
                                        {pairedEval.fullPair.diffUsd.toFixed(2)} (
                                        {pairedEval.fullPair.diffPct != null
                                          ? `${pairedEval.fullPair.diffPct > 0 ? '+' : ''}${pairedEval.fullPair.diffPct.toFixed(1)}%`
                                          : '—'}
                                        )
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Par Desconto × Desconto (Rebate) */}
                                <div className="p-3 rounded-md bg-background/50 border border-border/40 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                      <Tag className="w-3.5 h-3.5 text-purple-400" />
                                      <span>Preço com Rebate (Fabricante × B&H)</span>
                                    </span>
                                    {pairedEval.rebatePair ? (
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'text-[10px] font-mono',
                                          pairedEval.rebatePair.isWithinTolerance
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                                        )}
                                      >
                                        {pairedEval.rebatePair.isWithinTolerance
                                          ? 'OK'
                                          : 'Divergente'}
                                      </Badge>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground italic">
                                        {rebateInfo.isBhRebateActive
                                          ? 'Rebate apenas na B&H'
                                          : 'Sem rebate'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                    <div>
                                      <span className="text-muted-foreground block text-[11px]">
                                        Rebate Cadastrado:
                                      </span>
                                      <span className="font-semibold text-purple-300">
                                        {nativeRebatePrice != null
                                          ? `US$ ${nativeRebatePrice.toFixed(2)}`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block text-[11px]">
                                        B&H com Rebate:
                                      </span>
                                      <span className="font-semibold text-emerald-400">
                                        {rebateInfo.rebatePriceWithDiscount != null
                                          ? `US$ ${Number(rebateInfo.rebatePriceWithDiscount).toFixed(2)}`
                                          : '—'}
                                      </span>
                                    </div>
                                  </div>
                                  {pairedEval.rebatePair?.diffUsd != null && (
                                    <div className="text-[11px] font-mono pt-1 border-t border-border/30 flex justify-between text-muted-foreground">
                                      <span>Diferença no Rebate:</span>
                                      <span
                                        className={cn(
                                          pairedEval.rebatePair.diffUsd > 0
                                            ? 'text-amber-400'
                                            : 'text-blue-400',
                                        )}
                                      >
                                        {pairedEval.rebatePair.diffUsd > 0 ? '+' : ''}US${' '}
                                        {pairedEval.rebatePair.diffUsd.toFixed(2)} (
                                        {pairedEval.rebatePair.diffPct != null
                                          ? `${pairedEval.rebatePair.diffPct > 0 ? '+' : ''}${pairedEval.rebatePair.diffPct.toFixed(1)}%`
                                          : '—'}
                                        )
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Dados adicionais de rebate_info da B&H */}
                              {rebateInfo.isBhRebateActive && (
                                <div className="p-2.5 rounded bg-purple-500/10 border border-purple-500/20 text-xs flex flex-wrap items-center justify-between gap-2 text-purple-200">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                    <span>
                                      <strong>Instant Savings / Rebate ativo na B&H:</strong>{' '}
                                      Economia de{' '}
                                      {rebateInfo.rebateSavings != null ? (
                                        <strong className="text-emerald-400 font-mono">
                                          US$ {Number(rebateInfo.rebateSavings).toFixed(2)}
                                        </strong>
                                      ) : (
                                        'valor informado'
                                      )}
                                    </span>
                                  </div>
                                  {rebateInfo.rebateEndDate && (
                                    <div className="font-mono text-[11px] text-purple-300">
                                      Vigência B&H: <strong>{rebateInfo.rebateEndDate}</strong>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Atalhos Rápidos */}
                              <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
                                <span>
                                  Produto:{' '}
                                  <strong className="text-foreground">
                                    {product?.name || rec.product_id}
                                  </strong>
                                </span>
                                <div className="flex items-center gap-2">
                                  {product && (
                                    <Button
                                      asChild
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs bg-background/60"
                                    >
                                      <Link to={`/products/edit/${product.id}`} target="_blank">
                                        Editar no Catálogo
                                      </Link>
                                    </Button>
                                  )}
                                  {rec.url_used && (
                                    <Button
                                      asChild
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs bg-background/60"
                                    >
                                      <a
                                        href={rec.url_used}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Abrir na B&H <ExternalLink className="w-3 h-3 ml-1" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}

                {records.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Info className="w-6 h-6 text-muted-foreground/60" />
                        <p className="text-sm">
                          Nenhuma verificação de preço encontrada para os filtros selecionados.
                        </p>
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearAllFilters}
                            className="text-xs h-7"
                          >
                            Limpar filtros
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/50 p-3.5 bg-muted/10 text-xs text-muted-foreground">
              <span>
                Exibindo {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de{' '}
                {totalCount} registros
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 gap-1 bg-background/60"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </Button>
                <span className="font-mono text-foreground font-medium px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 gap-1 bg-background/60"
                >
                  Próxima <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

export default AdminPriceChecksPage
