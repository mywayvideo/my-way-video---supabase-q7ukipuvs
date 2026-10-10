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
  ChevronLeft,
  ChevronRight,
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
import { rebateDiscountService, ExistingRebateRule } from '@/services/rebateDiscountService'
import { RebateDiscountModal } from '@/components/admin/RebateDiscountModal'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'bh_batch_update_session_v1'

/**
 * Retorna true se last_reviewed_at existe, é da data de HOJE (dia civil local),
 * e não é anterior a updated_at (respeita a invariante do sistema: last_reviewed_at >= updated_at).
 */
export function isReviewedToday(
  lastReviewedAt?: string | null,
  updatedAt?: string | null,
): boolean {
  if (!lastReviewedAt) return false

  const reviewDate = new Date(lastReviewedAt)
  if (isNaN(reviewDate.getTime())) return false

  const today = new Date()
  const isSameDay =
    reviewDate.getFullYear() === today.getFullYear() &&
    reviewDate.getMonth() === today.getMonth() &&
    reviewDate.getDate() === today.getDate()

  if (!isSameDay) return false

  // Se houver updated_at, last_reviewed_at não pode ser anterior a ele
  if (updatedAt) {
    const updateDate = new Date(updatedAt)
    if (!isNaN(updateDate.getTime()) && reviewDate.getTime() < updateDate.getTime()) {
      return false
    }
  }

  return true
}

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

  // Estado do modal de Rebate Fabricante
  const [rebateModalOpen, setRebateModalOpen] = useState<boolean>(false)
  const [rebateModalProduct, setRebateModalProduct] = useState<ProductBatchItem | null>(null)
  const [rebateExistingRule, setRebateExistingRule] = useState<ExistingRebateRule | null>(null)

  const [isBulkReviewing, setIsBulkReviewing] = useState<boolean>(false)
  const [isMigratingRebates, setIsMigratingRebates] = useState<boolean>(false)

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

  // Referências para sincronização das barras de rolagem horizontal (superior e inferior/tabela)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const topTrackRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const [isDraggingTop, setIsDraggingTop] = useState(false)
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollLeft: 0,
    scrollWidth: 1150,
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
    // O componente Table do shadcn renderiza: <div className="relative w-full overflow-auto"><table ... /></div>
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
          // Prioriza produtos com last_reviewed_at mais antigo (ou nunca revisados)
          const aRev = a.last_reviewed_at || a.updated_at || 0
          const bRev = b.last_reviewed_at || b.updated_at || 0
          return new Date(aRev).getTime() - new Date(bRev).getTime()
        }
        if (sortBy === 'updated_at_desc') {
          const aRev = a.last_reviewed_at || a.updated_at || 0
          const bRev = b.last_reviewed_at || b.updated_at || 0
          return new Date(bRev).getTime() - new Date(aRev).getTime()
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
  }, [filteredProducts, getTableScrollElement, updateMetricsFromTable])

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

    // Centraliza a pegada na posição clicada
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
    const step = 280 // Deslocamento de 1 a 2 colunas
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

  // Produtos que estão selecionados
  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.has(p.id))
  }, [products, selectedIds])

  // Estimativa de consumo de créditos para os itens selecionados
  const creditsEstimate = useMemo(() => {
    return bhBatchUpdateService.estimateFirecrawlCredits(selectedProducts)
  }, [selectedProducts])

  // Estatísticas do processamento atual (com resolução pareada quando houver rebate nativo ativo)
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

  // Abertura do modal de Rebate Fabricante
  const handleOpenRebateModal = async (item: ProductBatchItem) => {
    setRebateModalProduct(item)
    const existing = await rebateDiscountService.findActiveRebateRule(item.id)
    setRebateExistingRule(existing)
    setRebateModalOpen(true)
  }

  // Rotina de migração em lote de regras legadas da tabela discounts para os campos nativos do produto
  const handleMigrateLegacyRebates = async () => {
    setIsMigratingRebates(true)
    try {
      const res = await rebateDiscountService.migrateLegacyRebates()
      if (res.migratedRulesCount === 0 && res.updatedProductsCount === 0) {
        toast({
          title: 'Migração concluída',
          description: 'Nenhuma regra legada pendente na tabela discounts.',
        })
      } else {
        toast({
          title: 'Regras legadas migradas com sucesso!',
          description: `${res.migratedRulesCount} regra(s) desativada(s) e ${res.updatedProductsCount} produto(s) atualizados com rebate nativo.`,
        })
        await loadInitialProducts()
      }
    } catch (err: any) {
      toast({
        title: 'Erro na migração de rebates',
        description: err.message || 'Falha ao migrar regras legadas.',
        variant: 'destructive',
      })
    } finally {
      setIsMigratingRebates(false)
    }
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

  // Ação 3: Entrada Manual de Link e Análise (para produtos sem link ou duvidosos)
  const handleAnalyzeManualUrl = async (item: ProductBatchItem) => {
    const rawUrl = (item.manualUrlDraft || '').trim()
    if (!rawUrl || !rawUrl.startsWith('http')) {
      toast({
        title: 'URL inválida',
        description: 'Cole uma URL válida da B&H iniciando com http:// ou https://',
        variant: 'destructive',
      })
      return
    }

    setProducts((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, isAnalyzingUrl: true, errorMessage: null } : p)),
    )

    try {
      const result = await bhBatchUpdateService.analyzeManualUrl(item.id, rawUrl)
      const nowIso = new Date().toISOString()

      if (result.status === 'sem_url_confirmada') {
        // MFR # não bateu com SKU do cadastro: não grava no banco, marca como duvidoso
        setProducts((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  isAnalyzingUrl: false,
                  batchStatus: 'done',
                  checkResult: result,
                }
              : p,
          ),
        )

        toast({
          title: 'Link duvidoso: MFR # divergente',
          description:
            result.message || 'O código de fabricante (MFR #) da página B&H não confere com o SKU.',
          variant: 'destructive',
        })
        return
      }

      if (result.status === 'erro') {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  isAnalyzingUrl: false,
                  batchStatus: 'error',
                  checkResult: result,
                  errorMessage: result.message || 'Falha ao analisar link',
                }
              : p,
          ),
        )

        toast({
          title: 'Erro na análise do link',
          description: result.message || 'Não foi possível extrair dados da página da B&H.',
          variant: 'destructive',
        })
        return
      }

      // Validado com sucesso! MFR # confere. O link foi gravado no banco pelo edge function.
      const newWebsiteUrl = result.url_used || rawUrl
      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                website_url: newWebsiteUrl,
                manualUrlDraft: newWebsiteUrl,
                updated_at: nowIso,
                last_reviewed_at: nowIso,
                isAnalyzingUrl: false,
                batchStatus: 'done',
                checkResult: result,
              }
            : p,
        ),
      )

      toast({
        title: 'Link validado com sucesso!',
        description: `MFR # conferido com SKU. Link gravado em website_url. Preço B&H: US$ ${result.price_bh?.toFixed(2) || '—'}.`,
      })
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, isAnalyzingUrl: false } : p)),
      )
      toast({
        title: 'Falha ao analisar link',
        description: err.message || 'Erro inesperado na verificação do link.',
        variant: 'destructive',
      })
    }
  }

  // Ação 4: Confirmação Manual de Revisão Individual (Atualiza SOMENTE last_reviewed_at)
  const handleConfirmSingleReview = async (item: ProductBatchItem) => {
    setProducts((prev) => prev.map((p) => (p.id === item.id ? { ...p, isReviewing: true } : p)))

    try {
      const reviewedAtIso = await bhBatchUpdateService.confirmSingleReview(item.id)

      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                last_reviewed_at: reviewedAtIso,
                isReviewing: false,
              }
            : p,
        ),
      )

      toast({
        title: 'Revisão confirmada!',
        description: `Produto "${item.name}" conferido manualmente. Data de revisão atualizada.`,
      })
    } catch (err: any) {
      setProducts((prev) => prev.map((p) => (p.id === item.id ? { ...p, isReviewing: false } : p)))
      toast({
        title: 'Erro ao confirmar revisão',
        description: err.message || 'Não foi possível registrar a conferência.',
        variant: 'destructive',
      })
    }
  }

  // Ação 4.5: Confirmação de Descontinuação Individual
  const handleConfirmSingleDiscontinued = async (item: ProductBatchItem) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, isUpdatingDiscontinued: true } : p)),
    )

    try {
      const nowIso = await priceCheckService.confirmDiscontinued(item.id)

      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                is_discontinued: true,
                updated_at: nowIso,
                last_reviewed_at: nowIso,
                isUpdatingDiscontinued: false,
              }
            : p,
        ),
      )

      toast({
        title: 'Descontinuação confirmada!',
        description: `Produto "${item.name}" marcado como descontinuado no catálogo.`,
      })
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, isUpdatingDiscontinued: false } : p)),
      )
      toast({
        title: 'Erro ao confirmar descontinuação',
        description: err.message || 'Falha ao atualizar o produto.',
        variant: 'destructive',
      })
    }
  }

  // Ação 4.6: Reativação de Produto Individual
  const handleReactivateSingleProduct = async (item: ProductBatchItem) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, isUpdatingDiscontinued: true } : p)),
    )

    try {
      const nowIso = await priceCheckService.reactivateProduct(item.id)

      setProducts((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                is_discontinued: false,
                updated_at: nowIso,
                last_reviewed_at: nowIso,
                isUpdatingDiscontinued: false,
              }
            : p,
        ),
      )

      toast({
        title: 'Produto reativado!',
        description: `Produto "${item.name}" reativado no catálogo com sucesso.`,
      })
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, isUpdatingDiscontinued: false } : p)),
      )
      toast({
        title: 'Erro ao reativar produto',
        description: err.message || 'Falha ao atualizar o produto.',
        variant: 'destructive',
      })
    }
  }

  // Ação 5: Confirmação de Descontinuação em Lote para Selecionados
  const handleConfirmBatchDiscontinued = async () => {
    const candidateIds = selectedProducts
      .filter((p) => {
        const pairedRes = bhBatchUpdateService.resolveItemPairedEvaluation(p)
        const effectiveStatus = pairedRes.effectiveStatus || p.checkResult?.status || null
        // Elegíveis: produtos cuja auditoria retornou descontinuado e ainda não estão salvos como descontinuados no banco
        return effectiveStatus === 'descontinuado' && !p.is_discontinued
      })
      .map((p) => p.id)

    if (candidateIds.length === 0) {
      toast({
        title: 'Nenhum produto elegível',
        description:
          'Selecione produtos cuja auditoria retornou "Descontinuado" para confirmar o flag em lote.',
        variant: 'destructive',
      })
      return
    }

    setIsBulkReviewing(true)
    try {
      const nowIso = await bhBatchUpdateService.confirmBatchDiscontinued(candidateIds)

      setProducts((prev) =>
        prev.map((p) =>
          candidateIds.includes(p.id)
            ? {
                ...p,
                is_discontinued: true,
                updated_at: nowIso,
                last_reviewed_at: nowIso,
              }
            : p,
        ),
      )

      toast({
        title: `Descontinuação de ${candidateIds.length} produto(s) confirmada!`,
        description:
          'Produtos marcados como descontinuados com datas atualizadas (updated_at e last_reviewed_at sincronizados).',
      })
    } catch (err: any) {
      toast({
        title: 'Erro na confirmação em lote',
        description: err.message || 'Falha ao confirmar descontinuação dos produtos selecionados.',
        variant: 'destructive',
      })
    } finally {
      setIsBulkReviewing(false)
    }
  }

  // Ação 6: Reativação em Lote para Selecionados
  const handleReactivateBatchProducts = async () => {
    const candidateIds = selectedProducts
      .filter((p) => {
        const pairedRes = bhBatchUpdateService.resolveItemPairedEvaluation(p)
        const effectiveStatus = pairedRes.effectiveStatus || p.checkResult?.status || null
        // Elegíveis: produtos flagados como descontinuados no banco mas cuja auditoria retornou disponível (ok ou divergente)
        return p.is_discontinued && (effectiveStatus === 'ok' || effectiveStatus === 'divergente')
      })
      .map((p) => p.id)

    if (candidateIds.length === 0) {
      toast({
        title: 'Nenhum produto elegível',
        description:
          'Selecione produtos descontinuados cuja auditoria retornou disponível (OK ou divergente) para reativar.',
        variant: 'destructive',
      })
      return
    }

    setIsBulkReviewing(true)
    try {
      const nowIso = await bhBatchUpdateService.reactivateBatchProducts(candidateIds)

      setProducts((prev) =>
        prev.map((p) =>
          candidateIds.includes(p.id)
            ? {
                ...p,
                is_discontinued: false,
                updated_at: nowIso,
                last_reviewed_at: nowIso,
              }
            : p,
        ),
      )

      toast({
        title: `Reativação de ${candidateIds.length} produto(s) confirmada!`,
        description: 'Produtos reativados no catálogo com sucesso.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro na reativação em lote',
        description: err.message || 'Falha ao reativar produtos selecionados.',
        variant: 'destructive',
      })
    } finally {
      setIsBulkReviewing(false)
    }
  }

  // Ação 7: Confirmação de Revisão em Lote para Selecionados
  const handleConfirmBatchReview = async () => {
    const candidateIds = selectedProducts
      .filter((p) => {
        // Elegíveis: produtos com status OK/validado (incluindo pareado) e link confirmado
        const hasUrl = Boolean(p.website_url && p.website_url.trim().startsWith('http'))
        const pairedRes = bhBatchUpdateService.resolveItemPairedEvaluation(p)
        const effectiveStatus = pairedRes.effectiveStatus || p.checkResult?.status || null

        const isOkOrClean =
          effectiveStatus === 'ok' || (!p.checkResult && hasUrl && !p.is_discontinued)
        return hasUrl && isOkOrClean
      })
      .map((p) => p.id)

    if (candidateIds.length === 0) {
      toast({
        title: 'Nenhum produto elegível',
        description:
          'Selecione produtos que possuam link validado da B&H e status alinhado/OK para confirmar a revisão.',
        variant: 'destructive',
      })
      return
    }

    setIsBulkReviewing(true)
    try {
      const reviewedAtIso = await bhBatchUpdateService.confirmBatchReview(candidateIds)

      setProducts((prev) =>
        prev.map((p) =>
          candidateIds.includes(p.id)
            ? {
                ...p,
                last_reviewed_at: reviewedAtIso,
              }
            : p,
        ),
      )

      toast({
        title: `Revisão de ${candidateIds.length} produtos confirmada!`,
        description:
          'Data de revisão (last_reviewed_at) atualizada sem alterar updated_at. Produtos desceram no topo da fila.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro na revisão em lote',
        description: err.message || 'Falha ao confirmar revisão dos produtos selecionados.',
        variant: 'destructive',
      })
    } finally {
      setIsBulkReviewing(false)
    }
  }

  const isAllFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id))

  return (
    <TooltipProvider delayDuration={200}>
      <AdminLayout breadcrumb="Atualização B&H em Lotes">
        <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16 animate-fade-in w-full min-w-0">
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
                disabled={loading || isProcessingBatch || isMigratingRebates}
                className="h-9"
              >
                <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
                Recarregar Catálogo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMigrateLegacyRebates}
                disabled={loading || isProcessingBatch || isMigratingRebates}
                className="h-9 text-xs border-purple-500/30 text-purple-300 hover:bg-purple-600/10"
                title="Migra regras ativas 'Rebate Fabricante' de discounts para os campos nativos de products e as desativa (idempotente)"
              >
                {isMigratingRebates ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Tag className="w-4 h-4 mr-2" />
                )}
                Migrar Rebates Legados
              </Button>
            </div>
          </div>

          {/* Widget Compacto de Créditos Firecrawl + Estimativa Real Pós-Otimização */}
          <div className="space-y-2">
            <FirecrawlCreditsWidget variant="compact" />
            <div className="bg-muted/30 border border-border/50 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <span>
                  <strong>Custos Firecrawl pós-otimização:</strong> 1 crédito para link validado
                  (scrape direto markdown); 3 créditos sem link (2 da busca + 1 do scrape do 1º
                  candidato, parando no match). Fallback JSON por IA = 5 créditos.
                </span>
              </div>
              <div className="font-mono text-[11px] bg-background/60 px-2.5 py-1 rounded border border-border/40 shrink-0 flex items-center gap-1.5">
                <span>Estimativa seleção:</span>
                <span className="text-foreground font-semibold">
                  ~{creditsEstimate.totalCredits} créditos
                </span>
                <span className="text-muted-foreground text-[10px]">
                  ({creditsEstimate.withLinkCount} × 1 cr direto +{' '}
                  {creditsEstimate.withoutLinkCount} × 3 cr busca)
                </span>
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
                    disabled={isProcessingBatch || isBulkReviewing}
                    className="h-9 text-xs"
                  >
                    +10 Mais Antigos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectTopUnprocessed(30)}
                    disabled={isProcessingBatch || isBulkReviewing}
                    className="h-9 text-xs"
                  >
                    +30 Mais Antigos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAllFiltered}
                    disabled={isProcessingBatch || isBulkReviewing || filteredProducts.length === 0}
                    className="h-9 text-xs"
                  >
                    {isAllFilteredSelected ? 'Desmarcar Visíveis' : 'Selecionar Todos Filtrados'}
                  </Button>

                  {/* Ações em Lote para Selecionados */}
                  {selectedIds.size > 0 && (
                    <>
                      {/* Ação em Lote: Confirmar Descontinuados */}
                      {(() => {
                        const discontinuedCandidates = selectedProducts.filter((p) => {
                          const pairedRes = bhBatchUpdateService.resolveItemPairedEvaluation(p)
                          const effStatus =
                            pairedRes.effectiveStatus || p.checkResult?.status || null
                          return effStatus === 'descontinuado' && !p.is_discontinued
                        })

                        if (discontinuedCandidates.length === 0) return null

                        return (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleConfirmBatchDiscontinued}
                            disabled={isProcessingBatch || isBulkReviewing}
                            className="h-9 text-xs font-medium shadow-sm"
                            title="Grava is_discontinued = true para todos os selecionados com auditoria descontinuado"
                          >
                            {isBulkReviewing ? (
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <AlertOctagon className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Confirmar Descontinuados ({discontinuedCandidates.length})
                          </Button>
                        )
                      })()}

                      {/* Ação em Lote: Reativar Produtos */}
                      {(() => {
                        const reactivateCandidates = selectedProducts.filter((p) => {
                          const pairedRes = bhBatchUpdateService.resolveItemPairedEvaluation(p)
                          const effStatus =
                            pairedRes.effectiveStatus || p.checkResult?.status || null
                          return (
                            p.is_discontinued && (effStatus === 'ok' || effStatus === 'divergente')
                          )
                        })

                        if (reactivateCandidates.length === 0) return null

                        return (
                          <Button
                            size="sm"
                            onClick={handleReactivateBatchProducts}
                            disabled={isProcessingBatch || isBulkReviewing}
                            className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium border border-emerald-500/30 shadow-sm"
                            title="Reativa produtos selecionados que estavam descontinuados e a auditoria detectou disponíveis"
                          >
                            {isBulkReviewing ? (
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Reativar ({reactivateCandidates.length})
                          </Button>
                        )
                      })()}

                      {/* Ação em Lote: Confirmar Revisão dos Selecionados */}
                      {(() => {
                        const allSelectedReviewedToday =
                          selectedProducts.length > 0 &&
                          selectedProducts.every((sp) =>
                            isReviewedToday(sp.last_reviewed_at, sp.updated_at),
                          )

                        if (allSelectedReviewedToday) {
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span tabIndex={0} className="inline-block cursor-not-allowed">
                                  <Button
                                    size="sm"
                                    disabled
                                    className="h-9 text-xs bg-muted/40 text-muted-foreground opacity-70 cursor-not-allowed border border-border/40 font-medium"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                                    Revisão Confirmada ({selectedIds.size})
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Revisão manual já confirmada para a data de hoje para todos os
                                selecionados
                              </TooltipContent>
                            </Tooltip>
                          )
                        }

                        return (
                          <Button
                            size="sm"
                            onClick={handleConfirmBatchReview}
                            disabled={isProcessingBatch || isBulkReviewing}
                            className="h-9 text-xs bg-emerald-600/90 hover:bg-emerald-600 text-white font-medium border border-emerald-500/30"
                            title="Atualiza SOMENTE last_reviewed_at dos produtos selecionados com link confirmado"
                          >
                            {isBulkReviewing ? (
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Confirmar Revisão ({selectedIds.size})
                          </Button>
                        )
                      })()}
                    </>
                  )}

                  {selectedIds.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                      disabled={isProcessingBatch || isBulkReviewing}
                      className="h-9 text-xs text-muted-foreground"
                    >
                      Limpar ({selectedIds.size})
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetAllStatuses}
                    disabled={isProcessingBatch || isBulkReviewing}
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
                      scrollMetrics.scrollWidth > 0 ? `${scrollMetrics.scrollWidth}px` : '1150px',
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
                    {/* Micro ranhuras visuais decorativas no centro do thumb */}
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
              <Table className="min-w-[1150px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/20">
                    <TableHead className="w-12 text-center table-sticky-col-header">
                      <Checkbox
                        checked={isAllFilteredSelected}
                        onCheckedChange={toggleSelectAllFiltered}
                        aria-label="Selecionar todos os filtrados"
                      />
                    </TableHead>
                    <TableHead className="bh-product-name-col table-sticky-col-header-2">
                      Produto & Fabricante
                    </TableHead>
                    <TableHead className="w-28">SKU</TableHead>
                    <TableHead className="w-28 text-right">Preço DB (FOB)</TableHead>
                    <TableHead className="w-32 text-right">Preço B&H</TableHead>
                    <TableHead className="w-32">Status da Auditoria</TableHead>
                    <TableHead className="w-32">Revisão Manual</TableHead>
                    <TableHead className="min-w-[280px]">Link B&H (Confirmado / Edição)</TableHead>
                    <TableHead className="w-44 text-right">Ação Corretiva</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((p) => {
                    const isSelected = selectedIds.has(p.id)
                    const isCurrent = currentProcessingId === p.id

                    // Resolução pareada unificada: avalia rebate ativo direto dos campos do produto
                    const pairedResolution = bhBatchUpdateService.resolveItemPairedEvaluation(p)

                    const effectiveStatus =
                      pairedResolution.effectiveStatus || p.checkResult?.status || null
                    const statusInfo = bhBatchUpdateService.getStatusLabel(
                      effectiveStatus,
                      p.batchStatus,
                    )
                    const priceDb = p.price_usd
                    const priceBh = p.checkResult?.price_bh
                    const diffUsd = p.checkResult?.diff_usd
                    const diffPct = p.checkResult?.diff_pct
                    const isDivergent = effectiveStatus === 'divergente'
                    const isDiscontinued = p.is_discontinued || effectiveStatus === 'descontinuado'
                    const isDoubtful = effectiveStatus === 'sem_url_confirmada'
                    const rebateActive = pairedResolution.rebateInfo.isBhRebateActive
                    const pairedEval = pairedResolution.pairedEval

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
                        <TableCell className="text-center table-sticky-col-cell">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(p.id)}
                            aria-label={`Selecionar ${p.name}`}
                          />
                        </TableCell>

                        {/* Produto e Fabricante */}
                        <TableCell className="bh-product-name-col table-sticky-col-cell-2">
                          <div className="flex flex-col min-w-0 pr-2 overflow-hidden">
                            <span
                              className="font-medium text-foreground text-sm truncate block"
                              title={p.name}
                            >
                              {p.name}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 truncate">
                              <span className="truncate">
                                {p.manufacturer?.name || 'Sem fabricante'}
                              </span>
                              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                •
                              </span>
                              <span
                                className="font-mono text-[11px] shrink-0"
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

                            {/* Se houver comparação pareada ativa (Cheio × Cheio e Rebate × Rebate) */}
                            {pairedEval && pairedEval.mode === 'paired' && (
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] py-0 px-1.5 flex items-center gap-1 font-mono',
                                    pairedEval.overallWithinTolerance
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                                  )}
                                  title={pairedEval.message}
                                >
                                  {pairedEval.overallWithinTolerance ? (
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                  ) : (
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                  )}
                                  <span>
                                    Pareado: Cheio{' '}
                                    {pairedEval.fullPair?.isWithinTolerance ? 'OK' : 'Div.'} ·
                                    Rebate{' '}
                                    {pairedEval.rebatePair?.isWithinTolerance ? 'OK' : 'Div.'}
                                  </span>
                                </Badge>
                              </div>
                            )}

                            {rebateActive && (
                              <div className="flex flex-col gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] bg-purple-500/15 text-purple-300 border-purple-500/30 py-0 flex items-center gap-1 cursor-help"
                                    >
                                      <Tag className="w-2.5 h-2.5" /> Rebate B&H
                                      {pairedResolution.rebateInfo.rebateEndDate && (
                                        <span className="text-[9px] font-mono opacity-80 truncate max-w-[120px]">
                                          • {pairedResolution.rebateInfo.rebateEndDate}
                                        </span>
                                      )}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs max-w-xs space-y-1 p-2.5">
                                    <p className="font-semibold text-purple-300">
                                      Instant Savings / Rebate Ativo na B&H
                                    </p>
                                    <p>
                                      Preço cheio:{' '}
                                      <strong>
                                        US${' '}
                                        {pairedResolution.rebateInfo.rebatePriceFull?.toFixed(2) ||
                                          '—'}
                                      </strong>
                                    </p>
                                    <p>
                                      Preço com rebate:{' '}
                                      <strong className="text-emerald-400">
                                        US${' '}
                                        {pairedResolution.rebateInfo.rebatePriceWithDiscount?.toFixed(
                                          2,
                                        ) || '—'}
                                      </strong>
                                    </p>
                                    {pairedResolution.rebateInfo.rebateEndDate && (
                                      <p className="text-purple-200 text-[11px] font-medium">
                                        Vigente até: {pairedResolution.rebateInfo.rebateEndDate}
                                      </p>
                                    )}
                                    {pairedEval && (
                                      <p className="text-blue-300 text-[11px] pt-1 border-t border-border/40">
                                        Status Pareado: {pairedEval.message}
                                      </p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/40">
                                      Conforme aprovado, rebates não são aplicados diretamente em
                                      price_usd.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                                {pairedResolution.rebateInfo.rebateEndDate && (
                                  <span
                                    className="text-[10px] text-purple-300/80 font-mono truncate max-w-[160px]"
                                    title={`Vigência do rebate: ${pairedResolution.rebateInfo.rebateEndDate}`}
                                  >
                                    Até: {pairedResolution.rebateInfo.rebateEndDate}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Revisão Manual (last_reviewed_at) */}
                        <TableCell>
                          <div className="flex flex-col text-xs">
                            <span
                              className="font-mono text-[11px] text-foreground/80 font-medium"
                              title={
                                p.last_reviewed_at
                                  ? `Revisado em: ${new Date(p.last_reviewed_at).toLocaleString('pt-BR')}`
                                  : 'Nunca revisado'
                              }
                            >
                              {p.last_reviewed_at ? (
                                new Date(p.last_reviewed_at).toLocaleDateString('pt-BR')
                              ) : (
                                <span className="text-muted-foreground italic">Nunca</span>
                              )}
                            </span>
                            {p.last_reviewed_at && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {new Date(p.last_reviewed_at).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Link B&H (Confirmado ou Campo Editável para Entrada Manual / Duvidoso) */}
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
                                onClick={() => handleAnalyzeManualUrl(p)}
                                disabled={
                                  p.isAnalyzingUrl ||
                                  !(p.manualUrlDraft || '').trim().startsWith('http')
                                }
                                className="h-7 px-2 text-[11px] shrink-0 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border-blue-500/30 font-medium"
                                title="Chama edge function para raspar a URL informada, conferir MFR # contra SKU e obter preço"
                              >
                                {p.isAnalyzingUrl ? (
                                  <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Search className="w-3 h-3 mr-1" />
                                )}
                                Analisar
                              </Button>
                            </div>
                          )}
                        </TableCell>

                        {/* Ações Corretivas por Linha */}
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Botão Rebate Fabricante */}
                            {rebateActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenRebateModal(p)}
                                className={cn(
                                  'h-7 text-[11px] px-2 font-medium border-purple-500/30 shadow-sm',
                                  p.price_usa_rebate != null && p.price_usa_rebate > 0
                                    ? 'bg-purple-500/20 text-purple-200 hover:bg-purple-500/30'
                                    : 'bg-purple-600/10 hover:bg-purple-600/20 text-purple-300',
                                )}
                                title={
                                  p.price_usa_rebate != null && p.price_usa_rebate > 0
                                    ? 'Editar vigência ou valor do rebate gravado nos campos do produto'
                                    : 'Ativar rebate do fabricante gravando diretamente nos campos do produto'
                                }
                              >
                                <Tag className="w-3 h-3 mr-1" />
                                {p.price_usa_rebate != null && p.price_usa_rebate > 0
                                  ? 'Editar Rebate'
                                  : 'Ativar Rebate'}
                              </Button>
                            )}

                            {/* Botão Aplicar B&H (Divergente) */}
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

                            {/* Botão Confirmar Revisão Manual Individual */}
                            {p.website_url &&
                              !isDiscontinued &&
                              (effectiveStatus === 'ok' || !p.checkResult) &&
                              (isReviewedToday(p.last_reviewed_at, p.updated_at) ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0} className="inline-block cursor-not-allowed">
                                      <Button
                                        size="sm"
                                        disabled
                                        variant="outline"
                                        className="h-7 text-[11px] px-2 bg-muted/40 text-muted-foreground opacity-70 cursor-not-allowed border-border/40 font-medium"
                                      >
                                        <CheckCircle2 className="w-3 h-3 mr-1 text-muted-foreground" />
                                        Revisão Confirmada
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Revisão manual já confirmada para a data de hoje
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleConfirmSingleReview(p)}
                                  disabled={p.isReviewing}
                                  className="h-7 text-[11px] px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-medium"
                                  title="Atualiza SOMENTE last_reviewed_at = agora, sem tocar updated_at"
                                >
                                  {p.isReviewing ? (
                                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3 mr-1" />
                                  )}
                                  Confirmar Revisão
                                </Button>
                              ))}

                            {/* Confirmação de Descontinuado quando a verificação retornar descontinuado e ainda não estiver gravado */}
                            {effectiveStatus === 'descontinuado' && !p.is_discontinued && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleConfirmSingleDiscontinued(p)}
                                disabled={p.isUpdatingDiscontinued}
                                className="h-7 text-[11px] px-2 font-medium shadow-sm"
                                title="Grava is_discontinued = true com updated_at = last_reviewed_at = agora"
                              >
                                {p.isUpdatingDiscontinued ? (
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <AlertOctagon className="w-3 h-3 mr-1" />
                                )}
                                Confirmar Descontinuado
                              </Button>
                            )}

                            {/* Reativação quando o produto estiver marcado como descontinuado no cadastro mas a verificação retornou disponível */}
                            {p.is_discontinued &&
                              (effectiveStatus === 'ok' || effectiveStatus === 'divergente') && (
                                <Button
                                  size="sm"
                                  onClick={() => handleReactivateSingleProduct(p)}
                                  disabled={p.isUpdatingDiscontinued}
                                  className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                                  title="Grava is_discontinued = false com updated_at = last_reviewed_at = agora"
                                >
                                  {p.isUpdatingDiscontinued ? (
                                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                  )}
                                  Reativar
                                </Button>
                              )}

                            {isDiscontinued &&
                              !(
                                p.is_discontinued &&
                                (effectiveStatus === 'ok' || effectiveStatus === 'divergente')
                              ) && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] uppercase font-mono py-0.5"
                                >
                                  Descontinuado
                                </Badge>
                              )}

                            {!isDivergent &&
                              !isDiscontinued &&
                              effectiveStatus === 'ok' &&
                              !p.website_url && (
                                <span className="text-emerald-400 font-mono text-xs flex items-center justify-end gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Alinhado
                                </span>
                              )}

                            {isDoubtful && !p.website_url && (
                              <span className="text-yellow-400 text-[11px] italic">
                                Cole URL ao lado
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}

                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
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

          {/* Modal de Configuração de Desconto: Rebate Fabricante */}
          <RebateDiscountModal
            isOpen={rebateModalOpen}
            onClose={() => {
              setRebateModalOpen(false)
              setRebateModalProduct(null)
              setRebateExistingRule(null)
            }}
            product={rebateModalProduct}
            existingRule={rebateExistingRule}
            onSuccess={async () => {
              await loadInitialProducts()
            }}
          />
        </div>
      </AdminLayout>
    </TooltipProvider>
  )
}
export default AdminBhUpdatePage
