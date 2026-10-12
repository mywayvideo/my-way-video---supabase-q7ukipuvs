import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AdminLayout } from '@/components/admin/AdminLayout'
import {
  categoryService,
  CategoryOverviewMetrics,
  CategorySummaryGroup,
} from '@/services/categoryService'
import {
  CategoryItem,
  CategoryProductItem,
  getProductCategorySuggestion,
  isNcmOutOfCategoryStandard,
  formatNcmPrefixDisplay,
  SuggestionConfidence,
} from '@/services/categoryTriageService'
import { CategoryEditDialog } from '@/components/admin/CategoryEditDialog'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Tag,
  Plus,
  RefreshCw,
  Search,
  FolderTree,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  MoveRight,
  Sparkles,
  Edit2,
  Trash2,
  Layers,
  ArrowRight,
  Clock,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

type ViewFilterTab = 'all' | 'triage_queue' | 'no_category' | 'assigned'

export function AdminCategoriesPage() {
  // Estado das Métricas e Categorias
  const [metrics, setMetrics] = useState<CategoryOverviewMetrics | null>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(true)

  // Filtros de visualização
  const [activeTab, setActiveTab] = useState<ViewFilterTab>('triage_queue')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)

  // Estado dos Produtos
  const [products, setProducts] = useState<CategoryProductItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loadingProducts, setLoadingProducts] = useState(false)

  // Seleção múltipla para Migração em Massa
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [targetCategoryForBulk, setTargetCategoryForBulk] = useState<string>('')
  const [isBulkMoving, setIsBulkMoving] = useState(false)

  // Decisões individuais na fila de triagem (em memória para o dropdown de cada linha)
  const [triageDecisions, setTriageDecisions] = useState<Record<string, string>>({})
  // Seleção de troca de categoria na coluna Ações para produtos já vinculados
  const [actionCategorySelections, setActionCategorySelections] = useState<Record<string, string>>(
    {},
  )
  const [savingProductId, setSavingProductId] = useState<string | null>(null)
  const [postponedIds, setPostponedIds] = useState<Set<string>>(new Set())

  // Scrollbar horizontal superior sincronizada com a tabela
  const topScrollRef = useRef<HTMLDivElement>(null)
  const topTrackRef = useRef<HTMLDivElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 0,
  })
  const [isDraggingTop, setIsDraggingTop] = useState(false)
  const topDragStartRef = useRef<{
    startX: number
    scrollLeft: number
    maxScroll: number
    trackTravel: number
  }>({
    startX: 0,
    scrollLeft: 0,
    maxScroll: 0,
    trackTravel: 0,
  })

  // CRUD Dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategorySummaryGroup | null>(null)

  // Delete Dialog
  const [deleteCandidate, setDeleteCandidate] = useState<CategorySummaryGroup | null>(null)
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)

  // Mapas rápidos
  const categoriesList = useMemo(() => metrics?.categories || [], [metrics])
  const categoriesById = useMemo(() => {
    const map = new Map<string, CategorySummaryGroup>()
    categoriesList.forEach((c) => map.set(c.id, c))
    return map
  }, [categoriesList])

  const categoriesByName = useMemo(() => {
    const map = new Map<string, CategoryItem>()
    categoriesList.forEach((c) => map.set(c.name, c))
    return map
  }, [categoriesList])

  // Carregar visão geral
  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoadingMetrics(true)
    try {
      const data = await categoryService.getCategoriesOverview()
      setMetrics(data)
    } catch (err: any) {
      console.error('Erro ao carregar métricas:', err)
      toast({
        title: 'Erro ao carregar categorias',
        description: err.message || 'Falha na conexão com o banco.',
        variant: 'destructive',
      })
    } finally {
      if (!silent) setLoadingMetrics(false)
    }
  }, [])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  // Buscar produtos de acordo com os filtros
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true)
    try {
      let filterType: 'all' | 'assigned' | 'triage_legacy' | 'triage_none' | 'by_category' = 'all'
      let catId: string | null = null

      if (selectedCategoryId) {
        filterType = 'by_category'
        catId = selectedCategoryId
      } else if (activeTab === 'triage_queue') {
        filterType = 'triage_legacy'
      } else if (activeTab === 'no_category') {
        filterType = 'triage_none'
      } else if (activeTab === 'assigned') {
        filterType = 'assigned'
      } else {
        filterType = 'all'
      }

      const res = await categoryService.fetchProducts({
        categoryId: catId,
        categoryFilterType: filterType,
        search: debouncedSearch,
        page,
        pageSize: PAGE_SIZE,
      })

      // Filtrar em memória os adiados se estiver na aba de triagem e sem busca específica
      let items = res.items
      if (activeTab === 'triage_queue' && postponedIds.size > 0 && !debouncedSearch) {
        items = items.filter((p) => !postponedIds.has(p.id))
      }

      setProducts(items)
      setTotalCount(res.totalCount)
      setSelectedProductIds([])
    } catch (err: any) {
      console.error('Erro ao buscar produtos:', err)
      toast({
        title: 'Erro ao buscar produtos',
        description: err.message || 'Falha ao buscar produtos da categoria.',
        variant: 'destructive',
      })
    } finally {
      setLoadingProducts(false)
    }
  }, [selectedCategoryId, activeTab, debouncedSearch, page, postponedIds])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Reset de página ao alterar aba ou categoria selecionada ou busca
  const handleSelectTab = (tab: ViewFilterTab) => {
    setActiveTab(tab)
    setSelectedCategoryId(null)
    setPage(1)
  }

  const handleSelectCategoryCard = (catId: string | null) => {
    setSelectedCategoryId(catId)
    setPage(1)
  }

  // Checkbox de seleção em massa
  const handleToggleSelectAll = () => {
    if (selectedProductIds.length === products.length) {
      setSelectedProductIds([])
    } else {
      setSelectedProductIds(products.map((p) => p.id))
    }
  }

  const handleToggleProduct = (id: string) => {
    if (selectedProductIds.includes(id)) {
      setSelectedProductIds(selectedProductIds.filter((pId) => pId !== id))
    } else {
      setSelectedProductIds([...selectedProductIds, id])
    }
  }

  // Executar migração em massa
  const handleExecuteBulkMove = async () => {
    if (!targetCategoryForBulk) {
      toast({
        title: 'Selecione o destino',
        description: 'Escolha para qual categoria deseja mover os produtos selecionados.',
        variant: 'destructive',
      })
      return
    }

    const targetCat = categoriesById.get(targetCategoryForBulk)
    if (!targetCat) return

    setIsBulkMoving(true)
    try {
      const res = await categoryService.moveProductsToCategory(
        selectedProductIds,
        targetCat.id,
        targetCat.name,
      )
      toast({
        title: 'Produtos migrados',
        description: `${res.count} produto(s) movido(s) com sucesso para "${targetCat.name}".`,
      })
      setSelectedProductIds([])
      setTargetCategoryForBulk('')
      // Atualizar contadores e lista em tempo real sem reload de página
      await Promise.all([loadOverview(true), loadProducts()])
    } catch (err: any) {
      toast({
        title: 'Falha na migração',
        description: err.message || 'Erro ao mover produtos.',
        variant: 'destructive',
      })
    } finally {
      setIsBulkMoving(false)
    }
  }

  // Confirmar sugestão ou categoria de um produto individual na fila de triagem
  const handleConfirmSingle = async (
    product: CategoryProductItem,
    chosenCategoryId?: string,
    chosenCategoryName?: string,
  ) => {
    let finalCatId = chosenCategoryId || triageDecisions[product.id]
    let finalCatName = chosenCategoryName

    if (finalCatId && !finalCatName) {
      finalCatName = categoriesById.get(finalCatId)?.name
    }

    if (!finalCatId) {
      // Fallback para a sugestão automática se nenhum id foi fornecido nem selecionado
      const suggestion = getProductCategorySuggestion(product, categoriesByName)
      if (suggestion?.categoryId) {
        finalCatId = suggestion.categoryId
        finalCatName = suggestion.categoryName
      }
    }

    if (!finalCatId || !finalCatName) {
      toast({
        title: 'Selecione uma categoria',
        description: 'Escolha uma categoria válida antes de confirmar.',
        variant: 'destructive',
      })
      return
    }

    setSavingProductId(product.id)
    try {
      await categoryService.confirmProductCategory(product.id, finalCatId, finalCatName)
      toast({
        title: 'Categoria confirmada',
        description: `"${product.name.slice(0, 35)}..." vinculada a "${finalCatName}".`,
      })
      // Remove da lista local para feedback imediato e recarrega contadores
      setProducts((prev) => prev.filter((p) => p.id !== product.id))
      setTotalCount((prev) => Math.max(0, prev - 1))
      loadOverview(true)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Falha ao confirmar categoria.',
        variant: 'destructive',
      })
    } finally {
      setSavingProductId(null)
    }
  }

  // Ação "Revisar depois" (adiciona à lista temporária de ignorados da sessão)
  const handlePostpone = (productId: string) => {
    setPostponedIds((prev) => new Set([...prev, productId]))
    setProducts((prev) => prev.filter((p) => p.id !== productId))
    setTotalCount((prev) => Math.max(0, prev - 1))
    toast({
      title: 'Item adiado',
      description: 'O produto foi ocultado da fila nesta sessão e poderá ser revisado depois.',
    })
  }

  // CRUD Categorias
  const handleOpenCreateCategory = () => {
    setEditingCategory(null)
    setEditDialogOpen(true)
  }

  const handleOpenEditCategory = (cat: CategorySummaryGroup, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingCategory(cat)
    setEditDialogOpen(true)
  }

  const handleDeleteCategoryPrompt = (cat: CategorySummaryGroup, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteCandidate(cat)
  }

  const handleConfirmDeleteCategory = async () => {
    if (!deleteCandidate) return
    setIsDeletingCategory(true)
    try {
      await categoryService.deleteCategory(deleteCandidate.id)
      toast({
        title: 'Categoria excluída',
        description: `A categoria "${deleteCandidate.name}" foi removida.`,
      })
      if (selectedCategoryId === deleteCandidate.id) {
        setSelectedCategoryId(null)
      }
      setDeleteCandidate(null)
      await loadOverview()
    } catch (err: any) {
      toast({
        title: 'Exclusão recusada',
        description: err.message || 'Não foi possível excluir a categoria.',
        variant: 'destructive',
      })
    } finally {
      setIsDeletingCategory(false)
    }
  }

  // Obter o elemento que realmente rola na tabela
  const getTableScrollElement = useCallback((): HTMLElement | null => {
    const container = tableContainerRef.current
    if (!container) return null
    const innerWrapper = container.querySelector<HTMLElement>('.relative.w-full.overflow-auto')
    if (innerWrapper) return innerWrapper
    const firstChild = container.firstElementChild as HTMLElement | null
    if (firstChild && firstChild.tagName === 'DIV') return firstChild
    return container
  }, [])

  const updateMetricsFromTable = useCallback(() => {
    const tableEl = getTableScrollElement()
    if (!tableEl) return
    setScrollMetrics({
      scrollLeft: tableEl.scrollLeft,
      scrollWidth: tableEl.scrollWidth,
      clientWidth: tableEl.clientWidth,
    })
  }, [getTableScrollElement])

  // Sincronizar listeners de scroll e resize entre a tabela e a scrollbar do topo
  useEffect(() => {
    const tableEl = getTableScrollElement()
    const topEl = topScrollRef.current
    if (!tableEl) return

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
    if (tableContainerRef.current && tableContainerRef.current !== tableEl) {
      observer.observe(tableContainerRef.current)
    }

    return () => {
      tableEl.removeEventListener('scroll', onTableScrollListener)
      if (topEl) {
        topEl.removeEventListener('scroll', onTopScrollListener)
      }
      observer.disconnect()
    }
  }, [products, getTableScrollElement, updateMetricsFromTable])

  // Drag handlers para a barra de rolagem horizontal superior
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1

  return (
    <AdminLayout breadcrumb="Gerenciamento de Categorias">
      <div className="space-y-6 pb-12">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <FolderTree className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Gerenciamento de Categorias
              </h1>
              <Badge variant="outline" className="text-xs font-normal">
                Fase 1 — Organização & NCMs
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Organize os produtos em categorias canônicas, processe a fila de triagem com sugestões
              automáticas de 2 camadas e valide o padrão dos NCMs aceitáveis da família.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadOverview()
                loadProducts()
              }}
              disabled={loadingMetrics || loadingProducts}
            >
              <RefreshCw
                className={cn(
                  'w-4 h-4 mr-2',
                  (loadingMetrics || loadingProducts) && 'animate-spin',
                )}
              />
              Atualizar
            </Button>
            <Button size="sm" onClick={handleOpenCreateCategory}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Categoria
            </Button>
          </div>
        </div>

        {/* ========================================================
            REQUISITO 6: VISÃO TOPO DA ABA - GRADE DE CATEGORIAS
            E CONTADORES AO VIVO POR GRUPO
        ======================================================== */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Visão Geral do Catálogo ({metrics?.totalProducts || 0} produtos)
            </h2>
            {selectedCategoryId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-primary hover:text-primary"
                onClick={() => setSelectedCategoryId(null)}
              >
                Limpar filtro de categoria
              </Button>
            )}
          </div>

          {/* Cards Rápidos de Grupo: Triagem Legada, Sem Categoria e Categorizados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Fila de Triagem (Rótulos Legados) */}
            <Card
              className={cn(
                'cursor-pointer transition-all border shadow-sm hover:border-primary/50',
                activeTab === 'triage_queue' && !selectedCategoryId
                  ? 'ring-2 ring-primary bg-primary/5 border-primary'
                  : 'bg-card',
              )}
              onClick={() => handleSelectTab('triage_queue')}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Fila de Triagem (Legado)
                  </p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                    {metrics?.withLegacyOnly ?? '...'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Rótulos legados para confirmar
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Sem Categoria (93) */}
            <Card
              className={cn(
                'cursor-pointer transition-all border shadow-sm hover:border-destructive/50',
                activeTab === 'no_category' && !selectedCategoryId
                  ? 'ring-2 ring-destructive bg-destructive/5 border-destructive'
                  : 'bg-card',
              )}
              onClick={() => handleSelectTab('no_category')}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Sem Categoria</p>
                  <p className="text-2xl font-bold text-destructive mt-1">
                    {metrics?.noCategory ?? '...'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Nenhum vínculo ou rótulo
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Categorizados Oficiais */}
            <Card
              className={cn(
                'cursor-pointer transition-all border shadow-sm hover:border-emerald-500/50',
                activeTab === 'assigned' && !selectedCategoryId
                  ? 'ring-2 ring-emerald-500 bg-emerald-500/5 border-emerald-500'
                  : 'bg-card',
              )}
              onClick={() => handleSelectTab('assigned')}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Oficiais Vinculados</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {metrics?.withCategoryId ?? '...'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Com category_id gravado
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Total de Categorias Cadastradas */}
            <Card
              className={cn(
                'cursor-pointer transition-all border shadow-sm hover:border-primary/50',
                activeTab === 'all' && !selectedCategoryId
                  ? 'ring-2 ring-primary bg-primary/5 border-primary'
                  : 'bg-card',
              )}
              onClick={() => handleSelectTab('all')}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total de Categorias</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {metrics?.categories.length ?? '...'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Audio + Net/Storage inclusas
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Layers className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Grade de Categorias Cadastradas com Contadores por Categoria */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-1">
            {categoriesList.map((cat) => {
              const isSelected = selectedCategoryId === cat.id
              return (
                <div
                  key={cat.id}
                  onClick={() => handleSelectCategoryCard(isSelected ? null : cat.id)}
                  className={cn(
                    'group relative p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between text-left',
                    isSelected
                      ? 'bg-primary/10 border-primary ring-1 ring-primary'
                      : 'bg-card hover:bg-muted/50 hover:border-border',
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-semibold text-xs truncate leading-snug" title={cat.name}>
                      {cat.name}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={(e) => handleOpenEditCategory(cat, e)}
                        title="Editar categoria e NCMs aceitáveis"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDeleteCategoryPrompt(cat, e)}
                        title="Excluir categoria"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Badges de contagem e NCMs */}
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={cat.product_count > 0 ? 'secondary' : 'outline'}
                        className="px-1.5 py-0 h-5 font-mono text-[10px]"
                      >
                        {cat.product_count} {cat.product_count === 1 ? 'prod' : 'prods'}
                      </Badge>
                      {cat.legacy_pending_count > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0 h-5 font-mono text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800"
                              >
                                +{cat.legacy_pending_count} leg
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {cat.legacy_pending_count} produto(s) possuem rótulo legado exato
                              &quot;{cat.name}&quot; aguardando confirmação.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>

                    {cat.out_of_standard_count > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="destructive"
                              className="px-1 py-0 h-4 text-[9px] flex items-center gap-0.5"
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {cat.out_of_standard_count}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {cat.out_of_standard_count} produto(s) possuem NCM fora do padrão dos
                            prefixos aceitáveis desta categoria.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  {/* NCMs aceitáveis preview */}
                  <div className="mt-1.5 pt-1.5 border-t border-border/40 text-[10px] text-muted-foreground truncate font-mono">
                    {cat.acceptable_ncms && cat.acceptable_ncms.length > 0 ? (
                      `NCMs: ${cat.acceptable_ncms.join(', ')}`
                    ) : (
                      <span className="italic">Nenhum NCM restrito</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ========================================================
            BARRA DE FERRAMENTAS & MIGRAÇÃO EM MASSA (REQUISITO 3)
        ======================================================== */}
        <div className="space-y-4 pt-2">
          {/* Barra de Filtros e Busca */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border">
            {/* Tabs de Filtro de Modo */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant={activeTab === 'triage_queue' && !selectedCategoryId ? 'default' : 'ghost'}
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleSelectTab('triage_queue')}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Fila de Triagem ({metrics?.withLegacyOnly || 0})
              </Button>
              <Button
                variant={activeTab === 'no_category' && !selectedCategoryId ? 'default' : 'ghost'}
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleSelectTab('no_category')}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Sem Categoria ({metrics?.noCategory || 0})
              </Button>
              <Button
                variant={activeTab === 'assigned' && !selectedCategoryId ? 'default' : 'ghost'}
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleSelectTab('assigned')}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Vinculados ({metrics?.withCategoryId || 0})
              </Button>
              <Button
                variant={activeTab === 'all' && !selectedCategoryId ? 'default' : 'ghost'}
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleSelectTab('all')}
              >
                Todos ({metrics?.totalProducts || 0})
              </Button>

              {selectedCategoryId && (
                <Badge
                  variant="secondary"
                  className="ml-2 gap-1 px-2.5 py-1 text-xs border-primary/30"
                >
                  <span>Filtrando por:</span>
                  <strong>{categoriesById.get(selectedCategoryId)?.name}</strong>
                  <button
                    onClick={() => setSelectedCategoryId(null)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </Badge>
              )}
            </div>

            {/* Campo de Busca */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, SKU, NCM..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9 h-9 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Barra de Ação em Massa por Checkbox (REQUISITO 3) */}
          {selectedProductIds.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-primary/10 border border-primary/30 rounded-lg animate-in fade-in-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">
                  <strong>{selectedProductIds.length}</strong> produto(s) selecionado(s)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedProductIds([])}
                >
                  Desmarcar todos
                </Button>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select value={targetCategoryForBulk} onValueChange={setTargetCategoryForBulk}>
                  <SelectTrigger className="h-8 text-xs w-[220px] bg-background">
                    <SelectValue placeholder="Mover para categoria..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesList.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id} className="text-xs">
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={!targetCategoryForBulk || isBulkMoving}
                  onClick={handleExecuteBulkMove}
                >
                  {isBulkMoving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Movendo...
                    </>
                  ) : (
                    <>
                      <MoveRight className="w-3.5 h-3.5" />
                      Confirmar Migração
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ========================================================
              TABELA DE PRODUTOS & FILA DE TRIAGEM (REQUISITOS 1, 2, 3)
          ======================================================== */}
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            {/* Barra de rolagem horizontal superior sincronizada com a tabela (Ajuste 3) */}
            <div
              className="relative w-full border-b border-border/60 bg-muted/40 select-none transition-colors hover:bg-muted/50 flex items-center px-1"
              style={{ height: '22px' }}
              aria-label="Barra de rolagem horizontal superior da listagem de produtos"
            >
              {/* Botão de rolagem para esquerda ◀ */}
              <button
                type="button"
                onClick={() => handleStepScroll('left')}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-95 transition-all cursor-pointer mr-1 z-10"
                title="Rolar tabela para a esquerda (◀)"
                aria-label="Rolar para a esquerda"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Contêiner nativo invisível espelhado para sincronização de eventos */}
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
                <div className="absolute left-0 right-0 h-2 bg-slate-900/90 dark:bg-slate-900/90 border border-slate-700/80 rounded-full shadow-inner" />

                {canScrollHorizontally && (
                  <div
                    onPointerDown={handleTopPointerDown}
                    onPointerMove={handleTopPointerMove}
                    onPointerUp={handleTopPointerUp}
                    onPointerCancel={handleTopPointerUp}
                    style={getThumbStyle()}
                    className={cn(
                      'absolute h-3.5 rounded-full cursor-grab active:cursor-grabbing transition-[filter,transform] duration-75 shadow-md z-10 flex items-center justify-center touch-none',
                      'bg-gradient-to-r from-primary/90 via-primary to-primary/90 hover:brightness-110 active:brightness-125 shadow-[0_1px_8px_rgba(59,130,246,0.5)] border border-primary/40',
                      isDraggingTop &&
                        'scale-y-110 brightness-125 shadow-[0_2px_10px_rgba(59,130,246,0.7)]',
                    )}
                  >
                    <div className="flex gap-0.5 pointer-events-none opacity-85">
                      <div className="w-0.5 h-1.5 bg-primary-foreground/70 rounded-full" />
                      <div className="w-0.5 h-1.5 bg-primary-foreground/70 rounded-full" />
                      <div className="w-0.5 h-1.5 bg-primary-foreground/70 rounded-full" />
                    </div>
                  </div>
                )}
              </div>

              {/* Botão de rolagem para direita ▶ */}
              <button
                type="button"
                onClick={() => handleStepScroll('right')}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-95 transition-all cursor-pointer ml-1 z-10"
                title="Rolar tabela para a direita (▶)"
                aria-label="Rolar para a direita"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div
              ref={tableContainerRef}
              className="overflow-x-auto [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-muted/30 [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-500"
              style={{
                scrollbarWidth: 'thin',
              }}
            >
              <Table className="min-w-[1050px]">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[44px] sticky left-0 z-20 bg-muted/95 backdrop-blur-xs">
                      <Checkbox
                        checked={
                          products.length > 0 && selectedProductIds.length === products.length
                        }
                        onCheckedChange={handleToggleSelectAll}
                        aria-label="Selecionar todos os produtos da página"
                      />
                    </TableHead>
                    <TableHead className="min-w-[300px] sticky left-[44px] z-20 bg-muted/95 backdrop-blur-xs border-r border-border/60 shadow-[4px_0_8px_-3px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_8px_-3px_rgba(0,0,0,0.3)]">
                      Produto & SKU
                    </TableHead>
                    <TableHead className="w-[140px]">Fabricante</TableHead>
                    <TableHead className="w-[140px]">NCM Atual</TableHead>
                    <TableHead className="w-[170px]">Rótulo Legado</TableHead>
                    <TableHead className="min-w-[320px]">
                      {activeTab === 'triage_queue'
                        ? 'Sugestão & Confirmação (Triagem)'
                        : 'Categoria Oficial'}
                    </TableHead>
                    <TableHead className="w-[170px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loadingProducts ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-44 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          <span className="text-sm">Carregando produtos...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-44 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                          <FolderTree className="w-8 h-8 opacity-40" />
                          <p className="text-base font-medium">Nenhum produto encontrado</p>
                          <p className="text-xs">
                            {activeTab === 'triage_queue'
                              ? 'Parabéns! Não há produtos pendentes na fila de triagem.'
                              : 'Tente alterar os termos de busca ou filtros aplicados.'}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => {
                      const isSelected = selectedProductIds.includes(product.id)
                      const isSaving = savingProductId === product.id

                      // Categoria oficial já vinculada
                      const assignedCategory = product.category_id
                        ? categoriesById.get(product.category_id)
                        : null

                      // Sugestão automática em 2 camadas (REQUISITO 2)
                      const suggestion: SuggestionConfidence | null = !product.category_id
                        ? getProductCategorySuggestion(product, categoriesByName)
                        : null

                      // Categoria selecionada no dropdown da linha (triageDecisions ou fallback da sugestão)
                      const chosenCategoryId =
                        triageDecisions[product.id] ||
                        suggestion?.categoryId ||
                        product.category_id ||
                        ''

                      // Avaliar padrão do NCM (REQUISITO 5)
                      // Se tem category_id atribuído, verifica com acceptable_ncms dela.
                      // Se estiver em triagem e tem categoria sugerida/escolhida, verifica com os NCMs dela.
                      const activeCatForNcmCheck =
                        assignedCategory ||
                        (chosenCategoryId ? categoriesById.get(chosenCategoryId) : null)

                      const isOutOfStandard = isNcmOutOfCategoryStandard(
                        product.ncm,
                        activeCatForNcmCheck?.acceptable_ncms,
                      )

                      // Categoria selecionada no dropdown "Trocar..." da coluna Ações (Ajuste 1)
                      const actionChosenCatId =
                        actionCategorySelections[product.id] || product.category_id || ''
                      const isActionChanged =
                        Boolean(actionChosenCatId) && actionChosenCatId !== product.category_id

                      return (
                        <TableRow
                          key={product.id}
                          className={cn(
                            'transition-colors',
                            isSelected && 'bg-primary/5',
                            isOutOfStandard && 'bg-amber-500/[0.03]',
                          )}
                        >
                          {/* Checkbox de Seleção Múltipla */}
                          <TableCell
                            className={cn(
                              'sticky left-0 z-10 bg-card transition-colors',
                              isSelected && 'bg-primary/5',
                              isOutOfStandard && 'bg-amber-500/[0.03]',
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleProduct(product.id)}
                              aria-label={`Selecionar ${product.name}`}
                            />
                          </TableCell>

                          {/* Produto: Imagem, Nome (Link clicável) e SKU */}
                          <TableCell
                            className={cn(
                              'sticky left-[44px] z-10 bg-card border-r border-border/60 shadow-[4px_0_8px_-3px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_8px_-3px_rgba(0,0,0,0.3)] transition-colors',
                              isSelected && 'bg-primary/5',
                              isOutOfStandard && 'bg-amber-500/[0.03]',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Link
                                to={`/products/edit/${product.id}`}
                                className="group/img shrink-0"
                                title="Abrir cadastro admin do produto (/products/edit/:id)"
                              >
                                {product.image_url ? (
                                  <img
                                    src={product.image_url}
                                    alt={product.name}
                                    className="w-10 h-10 object-contain rounded border bg-white group-hover/img:border-primary transition-colors"
                                    onError={(e) => {
                                      ;(e.target as HTMLElement).style.display = 'none'
                                    }}
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center group-hover/img:border-primary transition-colors">
                                    <Tag className="w-4 h-4 text-muted-foreground group-hover/img:text-primary" />
                                  </div>
                                )}
                              </Link>
                              <div className="min-w-0">
                                {/* Link para ir direto ao cadastro admin /products/edit/:id */}
                                <Link
                                  to={`/products/edit/${product.id}`}
                                  className="text-xs font-semibold text-foreground hover:text-primary hover:underline line-clamp-2 leading-snug inline-flex items-center gap-1 group/title"
                                  title={`Abrir cadastro admin: ${product.name}`}
                                >
                                  <span>{product.name}</span>
                                </Link>
                                <div className="flex items-center gap-2 mt-1">
                                  {product.sku && (
                                    <code className="text-[11px] font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
                                      {product.sku}
                                    </code>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Fabricante */}
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {product.manufacturer?.name || '—'}
                            </span>
                          </TableCell>

                          {/* NCM Atual + BADGE FORA DO PADRÃO (REQUISITOS 4, 5) */}
                          <TableCell>
                            <div className="space-y-1">
                              {product.ncm ? (
                                <div className="font-mono text-xs font-medium text-foreground">
                                  {formatNcmPrefixDisplay(product.ncm)}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  Sem NCM
                                </span>
                              )}

                              {isOutOfStandard && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Link
                                        to={`/products/edit/${product.id}`}
                                        className="inline-block"
                                      >
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1.5 py-0 h-5 font-normal bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 flex items-center gap-1 hover:bg-amber-500/20 cursor-pointer"
                                        >
                                          <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                          <span>NCM fora do padrão</span>
                                        </Badge>
                                      </Link>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      O NCM atual ({formatNcmPrefixDisplay(product.ncm || '')}) não
                                      casa com nenhum prefixo aceitável da categoria{' '}
                                      <strong>{activeCatForNcmCheck?.name}</strong> (
                                      {activeCatForNcmCheck?.acceptable_ncms?.join(', ') ||
                                        'nenhum'}
                                      ). Clique no badge para abrir o cadastro do produto.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>

                          {/* Rótulo Legado (coluna category) */}
                          <TableCell>
                            {product.category ? (
                              <Badge
                                variant="outline"
                                className="text-[11px] font-normal text-muted-foreground bg-muted/40 max-w-[150px] truncate block"
                                title={product.category}
                              >
                                {product.category}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                Nenhum rótulo
                              </span>
                            )}
                          </TableCell>

                          {/* FILA DE TRIAGEM / CATEGORIA OFICIAL (REQUISITO 1 & 2) */}
                          <TableCell>
                            {product.category_id ? (
                              // Produto já vinculado a uma categoria oficial
                              <div className="flex items-center gap-2">
                                <Badge className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white gap-1 px-2 py-0.5">
                                  <Check className="w-3 h-3" />
                                  {assignedCategory?.name || 'Categoria Gravada'}
                                </Badge>
                              </div>
                            ) : (
                              // Produto em fila de triagem (sugestão em 2 camadas + dropdown + botão Confirmar Categoria)
                              <div className="space-y-2">
                                {/* Selo de confiança da sugestão automática */}
                                {suggestion ? (
                                  <div className="flex items-center gap-1.5">
                                    {suggestion.level === 'high' ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] font-normal px-2 py-0.5 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 flex items-center gap-1"
                                      >
                                        <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span>sugestão automática — alta confiança</span>
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] font-normal px-2 py-0.5 bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-700 flex items-center gap-1"
                                      >
                                        <Sparkles className="w-3 h-3 text-sky-600 shrink-0" />
                                        <span>sugestão automática — média confiança</span>
                                      </Badge>
                                    )}

                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs text-xs">
                                          {suggestion.reason}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground italic">
                                    Sem sugestão automática conclusiva
                                  </span>
                                )}

                                {/* Dropdown apenas PREPARA a escolha (estado local) */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Select
                                      value={chosenCategoryId}
                                      onValueChange={(val) =>
                                        setTriageDecisions((prev) => ({
                                          ...prev,
                                          [product.id]: val,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-xs w-[200px] bg-background">
                                        <SelectValue placeholder="Escolher categoria..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {categoriesList.map((cat) => (
                                          <SelectItem
                                            key={cat.id}
                                            value={cat.id}
                                            className="text-xs"
                                          >
                                            {cat.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    {/* Botão Revisar Depois */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                                      onClick={() => handlePostpone(product.id)}
                                      title="Ocultar da fila de triagem nesta sessão para revisar depois"
                                    >
                                      <Clock className="w-3.5 h-3.5 mr-1" />
                                      Revisar depois
                                    </Button>
                                  </div>

                                  {/* Botão "Confirmar categoria" ABAIXO do seletor (Ajuste 1) */}
                                  <div>
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs px-3 bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-xs"
                                      disabled={!chosenCategoryId || isSaving}
                                      onClick={() => handleConfirmSingle(product, chosenCategoryId)}
                                      title="Efetivar e gravar categoria deste produto"
                                    >
                                      {isSaving ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                                          Salvando...
                                        </>
                                      ) : (
                                        <>
                                          <Check className="w-3.5 h-3.5 mr-1.5 text-primary-foreground" />
                                          Confirmar categoria
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </TableCell>

                          {/* Ações: Link para /product/:id e Seletor com Botão "Confirmar categoria" (Ajustes 1 e 2) */}
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1.5">
                              {/* Link direto para a página completa do produto */}
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-primary gap-1"
                                title="Abrir página completa do produto (/product/:id)"
                              >
                                <Link
                                  to={`/product/${product.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <span>Ver produto</span>
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              </Button>

                              {product.category_id && (
                                <div className="space-y-1 w-[140px] text-left">
                                  <Select
                                    value={actionChosenCatId}
                                    onValueChange={(newCatId) => {
                                      setActionCategorySelections((prev) => ({
                                        ...prev,
                                        [product.id]: newCatId,
                                      }))
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-full bg-background">
                                      <SelectValue placeholder="Trocar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categoriesList.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id} className="text-xs">
                                          {cat.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Botão Confirmar categoria abaixo do seletor Trocar */}
                                  {isActionChanged && (
                                    <Button
                                      size="sm"
                                      className="h-6 text-[11px] w-full px-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                                      disabled={isSaving}
                                      onClick={() => {
                                        const catObj = categoriesById.get(actionChosenCatId)
                                        if (catObj) {
                                          handleConfirmSingle(
                                            product,
                                            actionChosenCatId,
                                            catObj.name,
                                          )
                                        }
                                      }}
                                      title="Efetivar troca de categoria"
                                    >
                                      {isSaving ? (
                                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                      ) : (
                                        <Check className="w-3 h-3 mr-1" />
                                      )}
                                      Confirmar categoria
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Paginação do Servidor */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
              <div>
                Mostrando{' '}
                <strong>
                  {products.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0} -{' '}
                  {Math.min(page * PAGE_SIZE, totalCount)}
                </strong>{' '}
                de <strong>{totalCount}</strong> produto(s)
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page <= 1 || loadingProducts}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Anterior
                </Button>
                <span className="px-2 font-medium text-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page >= totalPages || loadingProducts}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Criação / Edição de Categorias e NCMs Aceitáveis */}
      <CategoryEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        category={editingCategory}
        onSaved={async () => {
          await loadOverview()
          await loadProducts()
        }}
      />

      {/* Confirmação de Exclusão de Categoria */}
      <AlertDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir categoria &quot;{deleteCandidate?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão só será permitida pelo sistema se{' '}
              <strong>não houver nenhum produto</strong> vinculado a esta categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCategory}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletingCategory}
              onClick={handleConfirmDeleteCategory}
            >
              {isDeletingCategory ? 'Verificando e excluindo...' : 'Confirmar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  )
}
export default AdminCategoriesPage
