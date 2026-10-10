import React, { useState, useEffect, useCallback, useMemo } from 'react'
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

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border/50">
                  <TableHead className="w-10 text-center"></TableHead>
                  <TableHead className="w-40 font-semibold text-xs">Data da Checagem</TableHead>
                  <TableHead className="table-sticky-col-header min-w-[240px] max-w-[320px] font-semibold text-xs">
                    Produto
                  </TableHead>
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
                        {/* Botão Expandir */}
                        <TableCell className="text-center p-2">
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

                        {/* Produto (Nome + link para /products/edit/:id) */}
                        <TableCell className="table-sticky-col-cell min-w-[240px] max-w-[320px]">
                          <div className="flex flex-col min-w-0 pr-2">
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
                              <span className="font-medium text-foreground text-sm truncate">
                                Produto {rec.product_id.slice(0, 8)}...
                              </span>
                            )}
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                              {product?.sku ? (
                                <span className="font-mono">{product.sku}</span>
                              ) : (
                                <span className="font-mono text-muted-foreground/60">Sem SKU</span>
                              )}
                              {product?.is_discontinued && (
                                <Badge
                                  variant="destructive"
                                  className="text-[9px] py-0 px-1 uppercase"
                                >
                                  Inativo
                                </Badge>
                              )}
                            </div>
                          </div>
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
