import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  XCircle,
  ArrowRight,
  Filter,
  CheckSquare,
  Square,
  Clock,
  Flame,
  Tag,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  ShieldCheck,
  ChevronDown,
  Info,
  Save,
  Check,
} from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { FirecrawlCreditsWidget } from '@/components/admin/FirecrawlCreditsWidget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import { bhBatchUpdateService, ProductBatchItem } from '@/services/bhBatchUpdateService'
import { priceCheckService } from '@/services/priceCheckService'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'bh_batch_update_session_v1'

export function AdminBhUpdatePage() {
  const [products, setProducts] = useState<ProductBatchItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Configurações dos Lotes
  const [batchSize, setBatchSize] = useState<number>(10)
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(60)

  // Filtros e ordenação
  const [filterType, setFilterType] = useState<
    'all' | 'without_link' | 'with_link' | 'discontinued'
  >('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [sortBy, setSortBy] = useState<
    'updated_at_asc' | 'updated_at_desc' | 'name_asc' | 'price_desc'
  >('updated_at_asc')

  // Estado da execução do lote
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false)
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null)
  const [remainingCooldown, setRemainingCooldown] = useState<number>(0)
  const [batchPauseRequested, setBatchPauseRequested] = useState<boolean>(false)

  // Referência para interromper de forma limpa o loop assíncrono
  const stopSignalRef = useRef<boolean>(false)
  const cooldownIntervalRef = useRef<any>(null)

  // 1. Carregar produtos iniciais
  const loadInitialProducts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await bhBatchUpdateService.fetchProductsForBatch(2000)

      // Se houver estado em localStorage da sessão atual, mescla para persistir status e url draft
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        try {
          const parsedCache: Record<string, Partial<ProductBatchItem>> = JSON.parse(cached)
          const merged = data.map((item) => {
            const saved = parsedCache[item.id]
            if (saved) {
              return {
                ...item,
                batchStatus: saved.batchStatus || item.batchStatus,
                checkResult: saved.checkResult || item.checkResult,
                errorMessage: saved.errorMessage || item.errorMessage,
                manualUrlDraft: saved.manualUrlDraft ?? item.manualUrlDraft,
                website_url: saved.website_url ?? item.website_url,
                price_usd: saved.price_usd ?? item.price_usd,
              }
            }
            return item
          })
          setProducts(merged)
        } catch {
          setProducts(data)
        }
      } else {
        setProducts(data)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar catálogo',
        description: err.message || 'Falha ao buscar produtos do banco.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitialProducts()
  }, [loadInitialProducts])

  // Salvar estado em localStorage quando itens forem alterados
  useEffect(() => {
    if (products.length === 0) return
    const stateMap: Record<string, any> = {}
    let hasRelevantState = false
    products.forEach((p) => {
      if (p.checkResult || p.batchStatus !== 'idle' || p.manualUrlDraft !== p.website_url) {
        hasRelevantState = true
        stateMap[p.id] = {
          batchStatus: p.batchStatus,
          checkResult: p.checkResult,
          errorMessage: p.errorMessage,
          manualUrlDraft: p.manualUrlDraft,
          website_url: p.website_url,
          price_usd: p.price_usd,
        }
      }
    })
    if (hasRelevantState) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateMap))
      } catch {
        // quota excedida ou localStorage desativado
      }
    }
  }, [products])

  // Gerenciamento do temporizador de refrigeração
  useEffect(() => {
    if (remainingCooldown > 0) {
      cooldownIntervalRef.current = setInterval(() => {
        setRemainingCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(cooldownIntervalRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current)
      }
    }

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current)
      }
    }
  }, [remainingCooldown])

  // 2. Filtragem e ordenação dos produtos
  const filteredProducts = useMemo(() => {
    return products
      .filter((item) => {
        // Filtro de status/link
        if (filterType === 'without_link') {
          const hasUrl = Boolean(item.website_url && item.website_url.trim().startsWith('http'))
          if (hasUrl) return false
        } else if (filterType === 'with_link') {
          const hasUrl = Boolean(item.website_url && item.website_url.trim().startsWith('http'))
          if (!hasUrl) return false
        } else if (filterType === 'discontinued') {
          if (!item.is_discontinued && item.checkResult?.status !== 'descontinuado') return false
        }

        // Filtro de busca por nome, SKU ou fabricante
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const nameMatch = item.name.toLowerCase().includes(q)
          const skuMatch = (item.sku || '').toLowerCase().includes(q)
          const mfrMatch = (item.manufacturer?.name || '').toLowerCase().includes(q)
          if (!nameMatch && !skuMatch && !mfrMatch) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'updated_at_asc') {
          return new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime()
        }
        if (sortBy === 'updated_at_desc') {
          return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
        }
        if (sortBy === 'name_asc') {
          return a.name.localeCompare(b.name)
        }
        if (sortBy === 'price_desc') {
          return (b.price_usd || 0) - (a.price_usd || 0)
        }
        return 0
      })
  }, [products, filterType, searchQuery, sortBy])

  // Produtos que estão selecionados
  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.has(p.id))
  }, [products, selectedIds])

  // Estimativa de consumo de créditos para os itens selecionados
  const creditsEstimate = useMemo(() => {
    return bhBatchUpdateService.estimateFirecrawlCredits(selectedProducts)
  }, [selectedProducts])

  // Estatísticas do processamento atual
  const stats = useMemo(() => {
    return bhBatchUpdateService.calculateStats(selectedProducts)
  }, [selectedProducts])

  // Itens selecionados que ainda não foram processados (pendentes no lote)
  const pendingSelectedItems = useMemo(() => {
    return selectedProducts.filter((p) => p.batchStatus !== 'done' && p.batchStatus !== 'error')
  }, [selectedProducts])

  // Manipuladores de Seleção
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAllFiltered = () => {
    const allFilteredIds = filteredProducts.map((p) => p.id)
    const allSelected = allFilteredIds.every((id) => selectedIds.has(id))

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        allFilteredIds.forEach((id) => next.delete(id))
      } else {
        allFilteredIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const selectTopUnprocessed = (count: number) => {
    const idsToSelect: string[] = []
    for (const p of filteredProducts) {
      if (idsToSelect.length >= count) break
      idsToSelect.push(p.id)
    }

    setSelectedIds((prev) => {
      const next = new Set(prev)
      idsToSelect.forEach((id) => next.add(id))
      return next
    })

    toast({
      title: `${idsToSelect.length} produtos selecionados`,
      description: `Primeiros ${idsToSelect.length} itens da lista filtrada adicionados à seleção.`,
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const resetAllStatuses = () => {
    localStorage.removeItem(STORAGE_KEY)
    setProducts((prev) =>
      prev.map((item) => ({
        ...item,
        batchStatus: 'idle',
        checkResult: null,
        errorMessage: null,
      })),
    )
    toast({
      title: 'Status reiniciados',
      description: 'O histórico da rodada foi limpo com sucesso.',
    })
  }

  // 3. Execução do lote seguro
  const executeBatch = async () => {
    if (pendingSelectedItems.length === 0) {
      toast({
        title: 'Nenhum item pendente',
        description: 'Selecione produtos que ainda não foram processados nesta rodada.',
        variant: 'destructive',
      })
      return
    }

    if (remainingCooldown > 0) {
      toast({
        title: 'Aguarde a refrigeração',
        description: `O temporizador de segurança está ativo (${remainingCooldown}s restantes).`,
        variant: 'destructive',
      })
      return
    }

    setIsProcessingBatch(true)
    setBatchPauseRequested(false)
    stopSignalRef.current = false

    // Pega o próximo pedaço conforme o batchSize configurado
    const currentChunk = pendingSelectedItems.slice(0, batchSize)
    let processedInThisBatch = 0

    for (let i = 0; i < currentChunk.length; i++) {
      if (stopSignalRef.current) {
        break
      }

      const item = currentChunk[i]
      setCurrentProcessingId(item.id)

      // Atualiza status para processing
      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, batchStatus: 'processing', errorMessage: null } : p,
        ),
      )

      try {
        const result = await bhBatchUpdateService.processSingleItem(item.id)

        // Se uma nova URL foi descoberta e gravada no banco pelo edge function, atualiza o item
        const newWebsiteUrl =
          result.url_discovered && result.url_used ? result.url_used : item.website_url

        setProducts((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  batchStatus: 'done',
                  checkResult: result,
                  website_url: newWebsiteUrl,
                  manualUrlDraft: newWebsiteUrl || p.manualUrlDraft,
                }
              : p,
          ),
        )
        processedInThisBatch++
      } catch (itemErr: any) {
        const errMsg = itemErr?.message || 'Falha na verificação B&H'
        setProducts((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  batchStatus: 'error',
                  errorMessage: errMsg,
                  checkResult: {
                    status: 'erro',
                    message: errMsg,
                    error: errMsg,
                  },
                }
              : p,
          ),
        )
      }

      // Pequena pausa natural de 300ms entre itens do mesmo lote para suavizar o render
      if (i < currentChunk.length - 1 && !stopSignalRef.current) {
        await new Promise((res) => setTimeout(res, 350))
      }
    }

    setCurrentProcessingId(null)
    setIsProcessingBatch(false)

    // Aciona o temporizador de refrigeração obrigatório entre lotes
    if (processedInThisBatch > 0) {
      setRemainingCooldown(cooldownSeconds)
      toast({
        title: `Lote de ${processedInThisBatch} produtos concluído!`,
        description: `Temporizador de segurança ativado (${cooldownSeconds}s). O próximo lote poderá ser iniciado após a contagem.`,
      })
    }
  }

  const handleStopBatch = () => {
    stopSignalRef.current = true
    setBatchPauseRequested(true)
  }

  // 4. Ações Manuais por Linha
  // Ação 1: Aplicar Preço da B&H em products.price_usd
  const handleApplyPrice = async (item: ProductBatchItem) => {
    const targetPrice = item.checkResult?.price_bh
    if (!targetPrice || targetPrice <= 0) {
      toast({
        title: 'Preço inválido',
        description: 'Não há preço B&H válido identificado para este item.',
        variant: 'destructive',
      })
      return
    }

    setProducts((prev) => prev.map((p) => (p.id === item.id ? { ...p, isApplyingPrice: true } : p)))

    try {
      await priceCheckService.applyBhPrice(item.id, targetPrice)

      const now = new Date().toISOString()
      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                price_usd: targetPrice,
                updated_at: now,
                last_reviewed_at: now,
                isApplyingPrice: false,
                checkResult: p.checkResult
                  ? {
                      ...p.checkResult,
                      status: 'ok',
                      price_usd_cadastrado: targetPrice,
                      diff_usd: 0,
                      diff_pct: 0,
                      message: 'Preço B&H aplicado com sucesso ao cadastro.',
                    }
                  : null,
              }
            : p,
        ),
      )

      toast({
        title: 'Preço B&H aplicado!',
        description: `Preço FOB Miami atualizado para US$ ${targetPrice.toFixed(2)}. Preço BRL recalculado.`,
      })
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, isApplyingPrice: false } : p)),
      )
      toast({
        title: 'Falha ao aplicar preço',
        description: err.message || 'Não foi possível atualizar o preço no banco.',
        variant: 'destructive',
      })
    }
  }

  // Ação 2: Confirmar URL manual editável na própria linha
  const handleConfirmManualUrl = async (item: ProductBatchItem) => {
    const manualUrl = (item.manualUrlDraft || '').trim()
    if (!manualUrl || !manualUrl.startsWith('http')) {
      toast({
        title: 'URL inválida',
        description: 'Cole uma URL válida da B&H iniciando com http:// ou https://',
        variant: 'destructive',
      })
      return
    }

    setProducts((prev) => prev.map((p) => (p.id === item.id ? { ...p, isSavingUrl: true } : p)))

    try {
      // 1. Grava a URL no produto
      await priceCheckService.updateWebsiteUrl(item.id, manualUrl)

      // 2. Dispara a re-verificação imediata do produto para revalidar MFR # e obter o preço
      const res = await priceCheckService.checkBhPrice(item.id, 'manual')

      const now = new Date().toISOString()
      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                website_url: manualUrl,
                updated_at: now,
                last_reviewed_at: now,
                isSavingUrl: false,
                batchStatus: 'done',
                checkResult: res,
              }
            : p,
        ),
      )

      toast({
        title: 'URL confirmada e revalidada!',
        description: 'Link gravado em website_url e checagem de preço concluída.',
      })
    } catch (err: any) {
      setProducts((prev) => prev.map((p) => (p.id === item.id ? { ...p, isSavingUrl: false } : p)))
      toast({
        title: 'Falha ao salvar URL',
        description: err.message || 'Erro ao revalidar link B&H.',
        variant: 'destructive',
      })
    }
  }

  const isAllFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id))

  return (
    <TooltipProvider delayDuration={200}>
      <AdminLayout breadcrumb="Atualização B&H em Lotes">
        <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16 animate-fade-in">
          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-400 border border-emerald-500/20">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                    Atualização B&H em Lotes
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Auditoria e atualização periódica do catálogo com tolerância de 1% / US$ 1,00
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild className="h-9">
                <Link to="/admin/catalog">Voltar ao Catálogo</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadInitialProducts}
                disabled={loading || isProcessingBatch}
                className="h-9"
              >
                <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
                Recarregar Catálogo
              </Button>
            </div>
          </div>

          {/* Widget Compacto de Créditos Firecrawl + Regra de Bolso */}
          <div className="space-y-2">
            <FirecrawlCreditsWidget variant="compact" />
            <div className="bg-muted/30 border border-border/50 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <span>
                  <strong>Regra de bolso Firecrawl:</strong> 1 crédito para produto com link
                  validado (raspagem direta); 2 créditos para produto sem link (busca + extração do
                  MFR #).
                </span>
              </div>
              <div className="font-mono text-[11px] bg-background/60 px-2 py-0.5 rounded border border-border/40 shrink-0">
                Estimativa desta seleção:{' '}
                <span className="text-foreground font-semibold">
                  {creditsEstimate.totalCredits} créditos
                </span>{' '}
                ({creditsEstimate.withLinkCount} com link + {creditsEstimate.withoutLinkCount} sem
                link)
              </div>
            </div>
          </div>

          {/* Painel de Controle de Lotes e Temporizador */}
          <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm sm:text-base text-foreground">
                    Controle de Lotes & Temporizador de Segurança
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Evite bloqueios e limites de requisição processando em lotes controlados com
                    refrigeração.
                  </p>
                </div>
              </div>

              {/* Botão de Disparo / Pausa do Lote */}
              <div className="flex items-center gap-3">
                {isProcessingBatch ? (
                  <Button
                    onClick={handleStopBatch}
                    variant="destructive"
                    className="h-10 px-4 font-semibold shadow-sm"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pausar Lote
                  </Button>
                ) : (
                  <Button
                    onClick={executeBatch}
                    disabled={
                      selectedIds.size === 0 ||
                      pendingSelectedItems.length === 0 ||
                      remainingCooldown > 0
                    }
                    className={cn(
                      'h-10 px-5 font-semibold text-white shadow-md transition-all',
                      remainingCooldown > 0
                        ? 'bg-amber-600/60 cursor-not-allowed hover:bg-amber-600/60'
                        : 'bg-emerald-600 hover:bg-emerald-700',
                    )}
                  >
                    {remainingCooldown > 0 ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-pulse" />
                        Refrigeração: {remainingCooldown}s
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Processar Próximo Lote ({Math.min(batchSize, pendingSelectedItems.length)})
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Configurações de Lote: Tamanho e Refrigeração */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>Tamanho do Lote</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Quantidade de produtos auditados sequencialmente antes da pausa de
                      refrigeração.
                    </TooltipContent>
                  </Tooltip>
                </label>
                <Select
                  value={String(batchSize)}
                  onValueChange={(val) => setBatchSize(Number(val))}
                  disabled={isProcessingBatch}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Tamanho do lote" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 produtos por lote</SelectItem>
                    <SelectItem value="10">10 produtos (padrão seguro)</SelectItem>
                    <SelectItem value="15">15 produtos por lote</SelectItem>
                    <SelectItem value="20">20 produtos por lote</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>Tempo de Refrigeração</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Intervalo de descanso do bot entre a conclusão de um lote e a liberação do
                      próximo.
                    </TooltipContent>
                  </Tooltip>
                </label>
                <Select
                  value={String(cooldownSeconds)}
                  onValueChange={(val) => setCooldownSeconds(Number(val))}
                  disabled={isProcessingBatch}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Tempo de refrigeração" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 segundos</SelectItem>
                    <SelectItem value="45">45 segundos</SelectItem>
                    <SelectItem value="60">60 segundos (padrão recomendado)</SelectItem>
                    <SelectItem value="90">90 segundos</SelectItem>
                    <SelectItem value="120">120 segundos (alta cautela)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground block">
                  Seleção Rápida no Catálogo
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectTopUnprocessed(10)}
                    disabled={isProcessingBatch}
                    className="h-9 text-xs"
                  >
                    +10 Mais Antigos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectTopUnprocessed(30)}
                    disabled={isProcessingBatch}
                    className="h-9 text-xs"
                  >
                    +30 Mais Antigos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAllFiltered}
                    disabled={isProcessingBatch || filteredProducts.length === 0}
                    className="h-9 text-xs"
                  >
                    {isAllFilteredSelected ? 'Desmarcar Visíveis' : 'Selecionar Todos Filtrados'}
                  </Button>
                  {selectedIds.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                      disabled={isProcessingBatch}
                      className="h-9 text-xs text-muted-foreground"
                    >
                      Limpar ({selectedIds.size})
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetAllStatuses}
                    disabled={isProcessingBatch}
                    className="h-9 text-xs text-muted-foreground ml-auto"
                    title="Limpa status das auditorias realizadas na tela"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Limpar Rodada
                  </Button>
                </div>
              </div>
            </div>

            {/* Barra de Progresso da Seleção Total */}
            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>
                    Progresso da seleção:{' '}
                    <strong className="text-foreground">
                      {stats.processedCount} de {stats.totalSelected} processados
                    </strong>
                  </span>
                  {selectedIds.size > 0 && (
                    <span className="text-muted-foreground">
                      ({pendingSelectedItems.length} pendentes)
                    </span>
                  )}
                </div>

                {remainingCooldown > 0 && (
                  <div className="text-amber-400 font-mono flex items-center gap-1.5 animate-pulse font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    Refrigeração do bot: aguarde {remainingCooldown}s para o próximo lote
                  </div>
                )}
              </div>

              <div className="w-full bg-muted/60 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-primary transition-all duration-300"
                  style={{
                    width: `${
                      stats.totalSelected > 0
                        ? Math.min(
                            100,
                            Math.round((stats.processedCount / stats.totalSelected) * 100),
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>

              {/* Estatísticas resumidas em badges */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
                  <Badge variant="outline" className="border-border/60 text-muted-foreground">
                    Total: {stats.totalSelected}
                  </Badge>
                  <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> OK: {stats.okCount}
                  </Badge>
                  <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-3 h-3 mr-1" /> Divergentes: {stats.divergenceCount}
                  </Badge>
                  <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    <Sparkles className="w-3 h-3 mr-1" /> Links Descobertos:{' '}
                    {stats.urlDiscoveredCount}
                  </Badge>
                  <Badge className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                    <HelpCircle className="w-3 h-3 mr-1" /> Links Duvidosos:{' '}
                    {stats.doubtfulLinkCount}
                  </Badge>
                  <Badge className="bg-red-500/15 text-red-400 border border-red-500/30">
                    <AlertOctagon className="w-3 h-3 mr-1" /> Descontinuados:{' '}
                    {stats.discontinuedCount}
                  </Badge>
                  {stats.errorCount > 0 && (
                    <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30">
                      <XCircle className="w-3 h-3 mr-1" /> Erros: {stats.errorCount}
                    </Badge>
                  )}
                  {stats.rebateDetectedCount > 0 && (
                    <Badge className="bg-purple-500/15 text-purple-400 border border-purple-500/30">
                      <Tag className="w-3 h-3 mr-1" /> Rebates Ativos: {stats.rebateDetectedCount}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Barra de Filtros e Busca */}
          <div className="bg-card border border-border/50 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5" /> Filtrar:
              </span>

              <Button
                size="sm"
                variant={filterType === 'all' ? 'secondary' : 'outline'}
                onClick={() => setFilterType('all')}
                className="h-8 text-xs"
              >
                Todos ({products.length})
              </Button>
              <Button
                size="sm"
                variant={filterType === 'without_link' ? 'secondary' : 'outline'}
                onClick={() => setFilterType('without_link')}
                className="h-8 text-xs"
              >
                Sem link B&H
              </Button>
              <Button
                size="sm"
                variant={filterType === 'with_link' ? 'secondary' : 'outline'}
                onClick={() => setFilterType('with_link')}
                className="h-8 text-xs"
              >
                Com link B&H
              </Button>
              <Button
                size="sm"
                variant={filterType === 'discontinued' ? 'secondary' : 'outline'}
                onClick={() => setFilterType('discontinued')}
                className="h-8 text-xs"
              >
                Descontinuados
              </Button>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="h-8 text-xs w-[200px]">
                  <SelectValue placeholder="Ordenação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated_at_asc">Mais desatualizados primeiro</SelectItem>
                  <SelectItem value="updated_at_desc">Mais recentes primeiro</SelectItem>
                  <SelectItem value="name_asc">Nome alfabético (A-Z)</SelectItem>
                  <SelectItem value="price_desc">Maior valor FOB</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto, SKU..."
                  className="pl-9 h-8 text-xs bg-background/50"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Tabela de Produtos */}
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/20">
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={isAllFilteredSelected}
                        onCheckedChange={toggleSelectAllFiltered}
                        aria-label="Selecionar todos os filtrados"
                      />
                    </TableHead>
                    <TableHead className="min-w-[240px]">Produto & Fabricante</TableHead>
                    <TableHead className="w-32">SKU</TableHead>
                    <TableHead className="w-28 text-right">Preço DB (FOB)</TableHead>
                    <TableHead className="w-32 text-right">Preço B&H</TableHead>
                    <TableHead className="w-32">Status da Auditoria</TableHead>
                    <TableHead className="min-w-[280px]">Link B&H (Confirmado / Edição)</TableHead>
                    <TableHead className="w-36 text-right">Ação Corretiva</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((p) => {
                    const isSelected = selectedIds.has(p.id)
                    const isCurrent = currentProcessingId === p.id
                    const statusInfo = bhBatchUpdateService.getStatusLabel(
                      p.checkResult?.status,
                      p.batchStatus,
                    )
                    const priceDb = p.price_usd
                    const priceBh = p.checkResult?.price_bh
                    const diffUsd = p.checkResult?.diff_usd
                    const diffPct = p.checkResult?.diff_pct
                    const isDivergent = p.checkResult?.status === 'divergente'
                    const isDiscontinued =
                      p.is_discontinued || p.checkResult?.status === 'descontinuado'
                    const isDoubtful = p.checkResult?.status === 'sem_url_confirmada'
                    const rebateActive = p.checkResult?.rebate_active

                    return (
                      <TableRow
                        key={p.id}
                        className={cn(
                          'transition-colors',
                          isSelected && 'bg-primary/5',
                          isCurrent && 'bg-blue-500/10 ring-1 ring-blue-500/30',
                        )}
                      >
                        {/* Checkbox de seleção */}
                        <TableCell className="text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(p.id)}
                            aria-label={`Selecionar ${p.name}`}
                          />
                        </TableCell>

                        {/* Produto e Fabricante */}
                        <TableCell>
                          <div className="flex flex-col min-w-0 pr-2">
                            <span
                              className="font-medium text-foreground text-sm truncate"
                              title={p.name}
                            >
                              {p.name}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span>{p.manufacturer?.name || 'Sem fabricante'}</span>
                              <span className="text-[10px] text-muted-foreground/60">•</span>
                              <span
                                className="font-mono text-[11px]"
                                title={`Última alteração: ${p.updated_at ? new Date(p.updated_at).toLocaleString('pt-BR') : 'nunca'}`}
                              >
                                {p.updated_at
                                  ? new Date(p.updated_at).toLocaleDateString('pt-BR')
                                  : 'Sem data'}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        {/* SKU */}
                        <TableCell>
                          <span className="font-mono text-xs text-foreground/90 font-medium">
                            {p.sku || <span className="text-muted-foreground italic">—</span>}
                          </span>
                        </TableCell>

                        {/* Preço DB */}
                        <TableCell className="text-right font-mono font-medium text-foreground">
                          {priceDb != null ? `US$ ${priceDb.toFixed(2)}` : 'US$ —'}
                        </TableCell>

                        {/* Preço B&H e Divergência */}
                        <TableCell className="text-right">
                          {priceBh != null ? (
                            <div className="flex flex-col items-end">
                              <span className="font-mono font-bold text-emerald-400 text-sm">
                                US$ {priceBh.toFixed(2)}
                              </span>
                              {diffUsd != null && diffUsd !== 0 && (
                                <span
                                  className={cn(
                                    'font-mono text-[11px] font-semibold',
                                    diffUsd > 0 ? 'text-amber-400' : 'text-blue-400',
                                  )}
                                >
                                  {diffUsd > 0 ? '+' : ''}US$ {diffUsd.toFixed(2)} (
                                  {diffPct != null && diffPct > 0 ? '+' : ''}
                                  {diffPct?.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">—</span>
                          )}
                        </TableCell>

                        {/* Status da Auditoria */}
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge
                              variant={statusInfo.variant}
                              className={cn(
                                'text-[11px] font-medium px-2 py-0.5',
                                statusInfo.className,
                              )}
                            >
                              {p.batchStatus === 'processing' && (
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              )}
                              {statusInfo.label}
                            </Badge>

                            {p.checkResult?.url_discovered && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30 py-0"
                              >
                                Link Gravado por MFR #
                              </Badge>
                            )}

                            {rebateActive && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-purple-500/15 text-purple-300 border-purple-500/30 py-0 flex items-center gap-1 cursor-help"
                                  >
                                    <Tag className="w-2.5 h-2.5" /> Rebate B&H
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs max-w-xs space-y-1 p-2.5">
                                  <p className="font-semibold text-purple-300">
                                    Instant Savings / Rebate Ativo na B&H
                                  </p>
                                  <p>
                                    Preço cheio:{' '}
                                    <strong>
                                      US$ {p.checkResult?.price_full?.toFixed(2) || '—'}
                                    </strong>
                                  </p>
                                  <p>
                                    Preço com rebate:{' '}
                                    <strong className="text-emerald-400">
                                      US$ {p.checkResult?.price_with_rebate?.toFixed(2) || '—'}
                                    </strong>
                                  </p>
                                  {p.checkResult?.rebate_end_date && (
                                    <p className="text-muted-foreground text-[11px]">
                                      Vigência identificada: {p.checkResult.rebate_end_date}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/40">
                                    Conforme aprovado, rebates não são aplicados automaticamente.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>

                        {/* Link B&H (Confirmado ou Campo Editável) */}
                        <TableCell>
                          {p.website_url ? (
                            <div className="flex items-center gap-2 max-w-[280px]">
                              <a
                                href={p.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-mono text-xs truncate flex items-center gap-1"
                                title={p.website_url}
                              >
                                {p.website_url}
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 max-w-[320px]">
                              <Input
                                placeholder="Colar URL B&H..."
                                className="h-7 text-xs font-mono bg-background/50"
                                value={p.manualUrlDraft || ''}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setProducts((prev) =>
                                    prev.map((item) =>
                                      item.id === p.id ? { ...item, manualUrlDraft: val } : item,
                                    ),
                                  )
                                }}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConfirmManualUrl(p)}
                                disabled={
                                  p.isSavingUrl ||
                                  !(p.manualUrlDraft || '').trim().startsWith('http')
                                }
                                className="h-7 px-2 text-[11px] shrink-0 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                                title="Grava URL e revalida MFR # contra SKU"
                              >
                                {p.isSavingUrl ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3 mr-1" />
                                )}
                                Confirmar
                              </Button>
                            </div>
                          )}
                        </TableCell>

                        {/* Ações Corretivas por Linha */}
                        <TableCell className="text-right whitespace-nowrap">
                          {isDivergent && priceBh != null && (
                            <Button
                              size="sm"
                              onClick={() => handleApplyPrice(p)}
                              disabled={p.isApplyingPrice}
                              className="h-7 text-xs px-2.5 bg-[#FF9F1A] hover:bg-[#FF9F1A]/90 text-[#111111] font-semibold shadow-sm"
                              title="Atualiza products.price_usd com 1 clique (trigger recalcula price_brl)"
                            >
                              {p.isApplyingPrice ? (
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <ArrowRight className="w-3 h-3 mr-1" />
                              )}
                              Aplicar B&H
                            </Button>
                          )}

                          {isDiscontinued && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] uppercase font-mono py-0.5"
                            >
                              Descontinuado
                            </Badge>
                          )}

                          {!isDivergent && !isDiscontinued && p.checkResult?.status === 'ok' && (
                            <span className="text-emerald-400 font-mono text-xs flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Alinhado
                            </span>
                          )}

                          {isDoubtful && !p.website_url && (
                            <span className="text-yellow-400 text-[11px] italic">
                              Cole URL ao lado
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}

                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                        {loading
                          ? 'Carregando catálogo...'
                          : 'Nenhum equipamento encontrado com estes filtros.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </AdminLayout>
    </TooltipProvider>
  )
}
export default AdminBhUpdatePage
