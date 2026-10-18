import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import {
  categoryImportStagingService,
  StagingProductItem,
} from '@/services/categoryImportStagingService'
import { CategoryItem } from '@/services/categoryTriageService'
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Sparkles,
  HelpCircle,
  ArrowRight,
  Loader2,
  Check,
  Ban,
  Layers,
  Edit3,
  ExternalLink,
  ImageIcon,
  Filter,
} from 'lucide-react'

export default function AdminImportReviewPage() {
  const [items, setItems] = useState<StagingProductItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [batches, setBatches] = useState<
    Array<{ batch_id: string; batch_source: string; created_at: string; total: number }>
  >([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [statusFilter, setStatusFilter] = useState<'pending' | 'confirmed' | 'discarded' | 'all'>(
    'pending',
  )
  const [batchFilter, setBatchFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchFilter, setSearchFilter] = useState<string>('')

  // Seleção múltipla (até 100 itens)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modal de correção de categoria
  const [editingItem, setEditingItem] = useState<StagingProductItem | null>(null)
  const [editCategoryId, setEditCategoryId] = useState<string>('')
  const [isConfirmingEdit, setIsConfirmingEdit] = useState(false)

  // Processamento em lote em chunks de 10
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null,
  )

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      // 1. Carregar categorias do BD
      const { data: catData } = await supabase.from('categories').select('id, name').order('name')
      if (catData) {
        setCategories(catData.map((c) => ({ id: c.id, name: c.name })))
      }

      // 2. Carregar lotes existentes
      const distinctBatches = await categoryImportStagingService.fetchDistinctBatches()
      setBatches(distinctBatches)

      // 3. Carregar itens com filtros aplicados
      const res = await categoryImportStagingService.fetchStagingItems({
        status: statusFilter,
        batchId: batchFilter !== 'all' ? batchFilter : undefined,
        suggestedCategoryName: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchFilter.trim() || undefined,
        limit: 500,
      })

      setItems(res.items || [])
      setSelectedIds(new Set())
    } catch (err: any) {
      console.error('Erro ao carregar fila de importação:', err)
      toast({
        title: 'Erro ao carregar itens',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, batchFilter, categoryFilter, searchFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Lista única de categorias sugeridas presentes nos itens carregados
  const distinctSuggestedCategories = useMemo(() => {
    const set = new Set<string>()
    items.forEach((it) => {
      if (it.suggested_category_name) set.add(it.suggested_category_name)
    })
    return Array.from(set).sort()
  }, [items])

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      // Máximo de seleção até 100 itens (padrão de segurança do projeto)
      const pendingItems = items.filter((it) => it.status === 'pending').slice(0, 100)
      setSelectedIds(new Set(pendingItems.map((it) => it.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        if (next.size >= 100) {
          toast({
            title: 'Limite atingido',
            description: 'Você pode selecionar no máximo até 100 itens por operação.',
          })
          return next
        }
        next.add(id)
      }
      return next
    })
  }

  // Confirmar item individual com a categoria sugerida
  const handleConfirmSingle = async (item: StagingProductItem) => {
    if (!item.suggested_category_id || !item.suggested_category_name) {
      // Abre o modal de correção se não houver sugestão válida
      openEditModal(item)
      return
    }

    try {
      const res = await categoryImportStagingService.confirmSingleStagingItem({
        stagingId: item.id,
        finalCategoryId: item.suggested_category_id,
        finalCategoryName: item.suggested_category_name,
      })

      if (res.success) {
        toast({
          title: 'Produto confirmado e salvo!',
          description: `"${item.name}" salvo em ${item.suggested_category_name}. Pipeline de relacionados disparado.`,
        })
        await loadData()
      } else {
        throw new Error(res.error || 'Erro ao confirmar produto')
      }
    } catch (err: any) {
      toast({
        title: 'Falha ao confirmar',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Descartar item individual
  const handleDiscardSingle = async (item: StagingProductItem) => {
    if (!confirm(`Deseja realmente descartar "${item.name}" da fila de importação?`)) return

    try {
      const res = await categoryImportStagingService.discardSingleStagingItem(
        item.id,
        'Descartado pelo operador',
      )
      if (res.success) {
        toast({
          title: 'Item descartado',
          description: `"${item.name}" marcado como descartado.`,
        })
        await loadData()
      } else {
        throw new Error(res.error || 'Erro ao descartar item')
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao descartar',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Abrir modal de correção manual de categoria
  const openEditModal = (item: StagingProductItem) => {
    setEditingItem(item)
    setEditCategoryId(item.suggested_category_id || '')
  }

  // Confirmar após corrigir categoria no modal
  const handleConfirmEdited = async () => {
    if (!editingItem || !editCategoryId) {
      toast({
        title: 'Selecione uma categoria',
        description: 'É necessário selecionar uma categoria do catálogo para confirmar o produto.',
        variant: 'destructive',
      })
      return
    }

    const targetCat = categories.find((c) => c.id === editCategoryId)
    if (!targetCat) return

    try {
      setIsConfirmingEdit(true)
      const res = await categoryImportStagingService.confirmSingleStagingItem({
        stagingId: editingItem.id,
        finalCategoryId: targetCat.id,
        finalCategoryName: targetCat.name,
      })

      if (res.success) {
        toast({
          title: 'Produto confirmado com categoria corrigida!',
          description: `"${editingItem.name}" salvo na categoria "${targetCat.name}". Mapeamento memorizado para importações futuras.`,
        })
        setEditingItem(null)
        await loadData()
      } else {
        throw new Error(res.error || 'Falha ao confirmar item')
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao confirmar',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsConfirmingEdit(false)
    }
  }

  // Confirmação em lote dos selecionados (em chunks de 10)
  const handleConfirmBatch = async () => {
    const selectedList = items.filter(
      (it) => selectedIds.has(it.id) && it.status === 'pending' && it.suggested_category_id,
    )

    if (selectedList.length === 0) {
      toast({
        title: 'Nenhum item apto selecionado',
        description:
          'Os itens selecionados devem ter sugestão de categoria válida para confirmação direta.',
        variant: 'destructive',
      })
      return
    }

    setIsBatchProcessing(true)
    const total = selectedList.length
    setBatchProgress({ current: 0, total })

    try {
      const itemsPayload = selectedList.map((it) => ({
        stagingId: it.id,
        categoryId: it.suggested_category_id!,
        categoryName: it.suggested_category_name || '',
      }))

      const result = await categoryImportStagingService.confirmBatchChunked(
        itemsPayload,
        (current, tot) => {
          setBatchProgress({ current, total: tot })
        },
      )

      toast({
        title: 'Lote confirmado!',
        description: `${result.confirmedCount} de ${total} produtos criados com sucesso e pipeline de relacionados disparado.`,
      })

      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro no processamento do lote',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsBatchProcessing(false)
      setBatchProgress(null)
    }
  }

  // Descarte em lote dos selecionados (em chunks de 10)
  const handleDiscardBatch = async () => {
    const selectedList = items.filter((it) => selectedIds.has(it.id) && it.status === 'pending')

    if (selectedList.length === 0) return
    if (
      !confirm(`Deseja realmente descartar ${selectedList.length} itens da fila de importação?`)
    ) {
      return
    }

    setIsBatchProcessing(true)
    const total = selectedList.length
    setBatchProgress({ current: 0, total })

    try {
      const ids = selectedList.map((it) => it.id)
      const result = await categoryImportStagingService.discardBatchChunked(
        ids,
        'Descarte em lote pelo operador',
        (current, tot) => {
          setBatchProgress({ current, total: tot })
        },
      )

      toast({
        title: 'Lote descartado',
        description: `${result.discardedCount} produtos foram marcados como descartados.`,
      })

      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro no descarte em lote',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsBatchProcessing(false)
      setBatchProgress(null)
    }
  }

  const renderConfidenceBadge = (confidence: 'alta' | 'media' | 'baixa') => {
    if (confidence === 'alta') {
      return (
        <Badge
          variant="outline"
          className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[11px]"
        >
          Alta Confiança
        </Badge>
      )
    }
    if (confidence === 'media') {
      return (
        <Badge
          variant="outline"
          className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[11px]"
        >
          Média Confiança
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[11px]">
        Baixa Confiança
      </Badge>
    )
  }

  const pendingCount = useMemo(() => items.filter((it) => it.status === 'pending').length, [items])
  const selectedCount = selectedIds.size

  return (
    <TooltipProvider delayDuration={200}>
      <AdminLayout breadcrumb="Revisão de Importação">
        <div className="flex flex-col gap-6 max-w-7xl mx-auto animate-fade-in pb-16">
          {/* Cabeçalho */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-lg text-primary">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  Área de Revisão de Importação
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Validação e confirmação de categorias pendentes de lotes CSV e B&amp;H antes de
                  gravar em produtos.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>

          {/* Barra de Progresso em Chunks */}
          {isBatchProcessing && batchProgress && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium text-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    Processando em chunks de 10 com persistência e pipeline de relacionados...
                  </span>
                  <span className="font-mono text-primary font-semibold">
                    {batchProgress.current} / {batchProgress.total} (
                    {Math.round((batchProgress.current / batchProgress.total) * 100)}%)
                  </span>
                </div>
                <Progress
                  value={(batchProgress.current / batchProgress.total) * 100}
                  className="h-2"
                />
              </CardContent>
            </Card>
          )}

          {/* Filtros e Barra de Ações em Massa */}
          <Card className="border-white/10 bg-card">
            <CardHeader className="pb-3 pt-4">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                  {/* Filtro Status */}
                  <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                    <SelectTrigger className="w-[160px] h-9 text-xs bg-background/50 border-white/10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Aguardando (Pendente)</SelectItem>
                      <SelectItem value="confirmed">Confirmados</SelectItem>
                      <SelectItem value="discarded">Descartados</SelectItem>
                      <SelectItem value="all">Todos os Status</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Filtro Lote */}
                  <Select value={batchFilter} onValueChange={setBatchFilter}>
                    <SelectTrigger className="w-[180px] h-9 text-xs bg-background/50 border-white/10">
                      <SelectValue placeholder="Lote de Origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Lotes</SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.batch_id} value={b.batch_id}>
                          {b.batch_source.toUpperCase()} · {b.batch_id.slice(-8)} ({b.total})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Filtro Categoria Sugerida */}
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[180px] h-9 text-xs bg-background/50 border-white/10">
                      <SelectValue placeholder="Categoria Sugerida" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Sugestões</SelectItem>
                      {distinctSuggestedCategories.map((cName) => (
                        <SelectItem key={cName} value={cName}>
                          {cName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Busca textual */}
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, SKU ou categoria..."
                      className="h-9 pl-9 text-xs bg-background/50 border-white/10"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>
                </div>

                {/* Ações em Massa */}
                {statusFilter === 'pending' && (
                  <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
                    <Button
                      size="sm"
                      onClick={handleConfirmBatch}
                      disabled={selectedCount === 0 || isBatchProcessing}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Confirmar Seleção ({selectedCount})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDiscardBatch}
                      disabled={selectedCount === 0 || isBatchProcessing}
                      className="text-xs h-9 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <Ban className="w-3.5 h-3.5 mr-1.5" />
                      Descartar Seleção ({selectedCount})
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="border-t border-white/10 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {statusFilter === 'pending' && (
                        <TableHead className="w-12 text-center">
                          <Checkbox
                            checked={
                              pendingCount > 0 && selectedCount === Math.min(pendingCount, 100)
                            }
                            onCheckedChange={toggleSelectAll}
                            aria-label="Selecionar todos"
                          />
                        </TableHead>
                      )}
                      <TableHead className="min-w-[280px]">Produto (Imagem / Nome / SKU)</TableHead>
                      <TableHead className="w-48">Categoria Original Informada</TableHead>
                      <TableHead className="w-64">Categoria Sugerida &amp; Confiança</TableHead>
                      <TableHead className="w-36">Lote / Origem</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="text-right w-44">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            Carregando itens da fila de staging...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                          Nenhum produto encontrado na fila para os filtros selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item) => {
                        const isSelected = selectedIds.has(item.id)
                        return (
                          <TableRow
                            key={item.id}
                            className={isSelected ? 'bg-primary/5' : undefined}
                          >
                            {statusFilter === 'pending' && (
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelectItem(item.id)}
                                  aria-label={`Selecionar ${item.name}`}
                                />
                              </TableCell>
                            )}

                            {/* Produto */}
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded bg-white/5 border border-white/10 shrink-0 flex items-center justify-center overflow-hidden">
                                  {item.image_url ? (
                                    <img
                                      src={item.image_url}
                                      alt={item.name}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span
                                    className="text-sm font-medium text-foreground truncate max-w-sm"
                                    title={item.name}
                                  >
                                    {item.name}
                                  </span>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-mono">{item.sku || 'Sem SKU'}</span>
                                    {item.brand_name && (
                                      <>
                                        <span>•</span>
                                        <span>{item.brand_name}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>

                            {/* Categoria Original */}
                            <TableCell>
                              <span className="text-xs font-mono text-zinc-300">
                                {item.original_category || (
                                  <span className="text-muted-foreground italic">
                                    Não informada
                                  </span>
                                )}
                              </span>
                            </TableCell>

                            {/* Categoria Sugerida & Confiança */}
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">
                                    {item.suggested_category_name || (
                                      <span className="text-amber-400 italic">Sem sugestão</span>
                                    )}
                                  </span>
                                  {renderConfidenceBadge(item.suggestion_confidence)}
                                </div>
                                {item.suggestion_reason && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <p className="text-[11px] text-muted-foreground truncate max-w-xs cursor-help">
                                        Motivo: {item.suggestion_reason}
                                      </p>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-sm text-xs">
                                      {item.suggestion_reason}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>

                            {/* Lote */}
                            <TableCell>
                              <div className="flex flex-col text-xs">
                                <span className="font-mono text-zinc-300">
                                  {item.batch_source.toUpperCase()}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(item.created_at).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                            </TableCell>

                            {/* Status */}
                            <TableCell>
                              {item.status === 'pending' && (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[11px]"
                                >
                                  Pendente
                                </Badge>
                              )}
                              {item.status === 'confirmed' && (
                                <div className="flex flex-col gap-1">
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[11px]"
                                  >
                                    Confirmado
                                  </Badge>
                                  {item.confirmed_product_id && (
                                    <Link
                                      to={`/products/edit/${item.confirmed_product_id}`}
                                      className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                                    >
                                      Ver produto <ExternalLink className="w-2.5 h-2.5" />
                                    </Link>
                                  )}
                                </div>
                              )}
                              {item.status === 'discarded' && (
                                <Badge
                                  variant="outline"
                                  className="bg-zinc-500/10 text-zinc-400 border-zinc-500/30 text-[11px]"
                                >
                                  Descartado
                                </Badge>
                              )}
                            </TableCell>

                            {/* Ações por item */}
                            <TableCell className="text-right">
                              {item.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    onClick={() => handleConfirmSingle(item)}
                                    className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                    title="Confirmar com a sugestão calculada"
                                  >
                                    <Check className="w-3.5 h-3.5 mr-1" />
                                    Confirmar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEditModal(item)}
                                    className="h-8 px-2.5 text-xs border-white/10"
                                    title="Corrigir categoria manualmente"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDiscardSingle(item)}
                                    className="h-8 px-2 text-xs text-red-400 hover:bg-red-500/10"
                                    title="Descartar item"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ) : item.status === 'confirmed' && item.confirmed_product_id ? (
                                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                                  <Link to={`/products/edit/${item.confirmed_product_id}`}>
                                    Editar Catálogo <ArrowRight className="w-3 h-3 ml-1" />
                                  </Link>
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Modal de Correção Manual de Categoria */}
          <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
            <DialogContent className="max-w-md bg-card border-white/10">
              <DialogHeader>
                <DialogTitle>Corrigir Categoria do Produto</DialogTitle>
                <DialogDescription>
                  Selecione a categoria real do catálogo para confirmar este item. A associação será
                  memorizada para lotes futuros.
                </DialogDescription>
              </DialogHeader>

              {editingItem && (
                <div className="space-y-4 py-2">
                  <div className="p-3 rounded-lg bg-background/50 border border-white/5 space-y-1">
                    <p className="text-xs text-muted-foreground">Produto:</p>
                    <p className="text-sm font-semibold text-foreground">{editingItem.name}</p>
                    {editingItem.original_category && (
                      <p className="text-xs text-zinc-400">
                        Categoria informada na importação:{' '}
                        <strong>{editingItem.original_category}</strong>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      Categoria Real no Catálogo:
                    </label>
                    <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                      <SelectTrigger className="bg-background border-white/10">
                        <SelectValue placeholder="Escolha a categoria..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setEditingItem(null)}
                  disabled={isConfirmingEdit}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmEdited}
                  disabled={isConfirmingEdit || !editCategoryId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isConfirmingEdit ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-1.5" />
                  )}
                  Confirmar e Salvar no Catálogo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AdminLayout>
    </TooltipProvider>
  )
}
