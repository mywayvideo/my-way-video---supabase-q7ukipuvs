import { useEffect, useState, useMemo } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Sparkles,
  HelpCircle,
  Plus,
  ArrowRight,
  Loader2,
  Check,
  Ban,
  Layers,
} from 'lucide-react'

interface PendingReviewItem {
  productId: string
  productName: string
  productSku: string | null
  productCategory: string | null
  suggestedId: string
  suggestedName: string
  suggestedSku: string | null
  suggestedCategory: string | null
  confidence: 'baixa' | 'media' | 'alta'
  reason: string
  ruleId: string | null
}

interface ProductSearchResult {
  id: string
  name: string
  sku: string | null
  category: string | null
}

export default function AdminRelatedReviewPage() {
  const [items, setItems] = useState<PendingReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [searchFilter, setSearchFilter] = useState('')

  // Modal para adicionar relacionado manualmente
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [targetProduct, setTargetProduct] = useState<{ id: string; name: string } | null>(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogResults, setCatalogResults] = useState<ProductSearchResult[]>([])
  const [searchingCatalog, setSearchingCatalog] = useState(false)

  // Processamento em lote em chunks de 10 em 10
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null,
  )

  const loadPendingReviews = async () => {
    try {
      setLoading(true)
      // Buscar produtos que possuem ai_related_meta com pelo menos uma sugestão de baixa confiança
      const { data: prods, error } = await (supabase as any)
        .from('products')
        .select(
          'id, name, sku, category, ai_related_ids, ai_related_meta, rejected_related_ids, manual_related_ids',
        )
        .not('ai_related_meta', 'is', null)
        .limit(200)

      if (error) throw error

      const pendingList: PendingReviewItem[] = []
      const candidateIdsToFetch = new Set<string>()

      for (const p of (prods || []) as any[]) {
        const meta = (p.ai_related_meta || {}) as Record<
          string,
          { confidence?: string; reason?: string; rule_id?: string | null }
        >
        for (const [suggId, itemMeta] of Object.entries(meta)) {
          if (itemMeta?.confidence === 'baixa') {
            candidateIdsToFetch.add(suggId)
          }
        }
      }

      // Buscar detalhes dos produtos sugeridos
      const nameMap = new Map<
        string,
        { name: string; sku: string | null; category: string | null }
      >()
      if (candidateIdsToFetch.size > 0) {
        const { data: candData } = await (supabase as any)
          .from('products')
          .select('id, name, sku, category')
          .in('id', Array.from(candidateIdsToFetch))

        candData?.forEach((c: any) => {
          nameMap.set(c.id, { name: c.name, sku: c.sku, category: c.category })
        })
      }

      for (const p of (prods || []) as any[]) {
        const meta = (p.ai_related_meta || {}) as Record<
          string,
          { confidence?: string; reason?: string; rule_id?: string | null }
        >
        for (const [suggId, itemMeta] of Object.entries(meta)) {
          if (itemMeta?.confidence === 'baixa') {
            const cand = nameMap.get(suggId)
            pendingList.push({
              productId: p.id,
              productName: p.name,
              productSku: p.sku,
              productCategory: p.category,
              suggestedId: suggId,
              suggestedName: cand?.name || suggId,
              suggestedSku: cand?.sku || null,
              suggestedCategory: cand?.category || null,
              confidence: 'baixa',
              reason: itemMeta?.reason || 'Inferência preliminar da IA (necessita conferência)',
              ruleId: itemMeta?.rule_id || null,
            })
          }
        }
      }

      setItems(pendingList)
      setSelectedKeys(new Set())
    } catch (err: any) {
      console.error('Erro ao carregar fila de revisão:', err)
      toast({
        title: 'Erro ao carregar fila',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPendingReviews()
  }, [])

  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return items
    const q = searchFilter.toLowerCase()
    return items.filter(
      (it) =>
        it.productName.toLowerCase().includes(q) ||
        (it.productSku && it.productSku.toLowerCase().includes(q)) ||
        it.suggestedName.toLowerCase().includes(q) ||
        (it.suggestedSku && it.suggestedSku.toLowerCase().includes(q)) ||
        it.reason.toLowerCase().includes(q),
    )
  }, [items, searchFilter])

  const getItemKey = (item: PendingReviewItem) => `${item.productId}::${item.suggestedId}`

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      // Máximo de seleção de até 100 itens (padrão do projeto)
      const keys = new Set(filteredItems.slice(0, 100).map(getItemKey))
      setSelectedKeys(keys)
    } else {
      setSelectedKeys(new Set())
    }
  }

  const toggleSelectItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else {
        if (next.size >= 100) {
          toast({
            title: 'Limite atingido',
            description: 'Você pode selecionar até 100 itens por lote.',
          })
          return next
        }
        next.add(key)
      }
      return next
    })
  }

  // Aprovar item individual ou em bloco: promove confiança de 'baixa' para 'alta' (ou remove de pendente)
  const processApproval = async (itemKeys: string[]) => {
    if (itemKeys.length === 0) return

    setIsBatchProcessing(true)
    const itemsToProcess = items.filter((it) => itemKeys.includes(getItemKey(it)))
    const total = itemsToProcess.length
    setBatchProgress({ current: 0, total })

    // Agrupar por produto de origem
    const byProduct = new Map<string, PendingReviewItem[]>()
    for (const it of itemsToProcess) {
      const arr = byProduct.get(it.productId) || []
      arr.push(it)
      byProduct.set(it.productId, arr)
    }

    const CHUNK_SIZE = 10
    const productEntries = Array.from(byProduct.entries())
    let processedCount = 0

    try {
      for (let i = 0; i < productEntries.length; i += CHUNK_SIZE) {
        const chunk = productEntries.slice(i, i + CHUNK_SIZE)

        await Promise.all(
          chunk.map(async ([prodId, prodItems]) => {
            // Ler dados atuais do produto
            const { data: p } = await (supabase as any)
              .from('products')
              .select('id, ai_related_ids, ai_related_meta')
              .eq('id', prodId)
              .single()

            if (p) {
              const meta = { ...((p.ai_related_meta || {}) as Record<string, any>) }
              for (const it of prodItems) {
                if (meta[it.suggestedId]) {
                  meta[it.suggestedId] = {
                    ...meta[it.suggestedId],
                    confidence: 'alta', // Aprovado pelo operador
                    approved_at: new Date().toISOString(),
                  }
                }
              }

              await (supabase as any)
                .from('products')
                .update({ ai_related_meta: meta })
                .eq('id', prodId)
            }
            processedCount += prodItems.length
            setBatchProgress({ current: processedCount, total })
          }),
        )

        // Pequena espera entre chunks (padrão de processamento do projeto)
        await new Promise((r) => setTimeout(r, 200))
      }

      toast({
        title: 'Sugestões aprovadas!',
        description: `${total} relacionamento(s) aprovado(s) e promovidos para alta confiança.`,
      })
      await loadPendingReviews()
    } catch (err: any) {
      toast({
        title: 'Erro no processamento',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsBatchProcessing(false)
      setBatchProgress(null)
    }
  }

  // Rejeitar item individual ou em bloco: adiciona em rejected_related_ids e remove de ai_related_ids
  const processRejection = async (itemKeys: string[]) => {
    if (itemKeys.length === 0) return
    if (
      !confirm(
        `Deseja realmente rejeitar ${itemKeys.length} relacionamento(s)? Eles não serão mais sugeridos pela IA.`,
      )
    )
      return

    setIsBatchProcessing(true)
    const itemsToProcess = items.filter((it) => itemKeys.includes(getItemKey(it)))
    const total = itemsToProcess.length
    setBatchProgress({ current: 0, total })

    const byProduct = new Map<string, PendingReviewItem[]>()
    for (const it of itemsToProcess) {
      const arr = byProduct.get(it.productId) || []
      arr.push(it)
      byProduct.set(it.productId, arr)
    }

    const CHUNK_SIZE = 10
    const productEntries = Array.from(byProduct.entries())
    let processedCount = 0

    try {
      for (let i = 0; i < productEntries.length; i += CHUNK_SIZE) {
        const chunk = productEntries.slice(i, i + CHUNK_SIZE)

        await Promise.all(
          chunk.map(async ([prodId, prodItems]) => {
            const { data: p } = await (supabase as any)
              .from('products')
              .select('id, ai_related_ids, ai_related_meta, rejected_related_ids')
              .eq('id', prodId)
              .single()

            if (p) {
              const currentAiIds = Array.isArray(p.ai_related_ids) ? p.ai_related_ids : []
              const currentRejected = Array.isArray(p.rejected_related_ids)
                ? p.rejected_related_ids
                : []
              const meta = { ...((p.ai_related_meta || {}) as Record<string, any>) }

              const toRejectIds = prodItems.map((it) => it.suggestedId)
              const updatedAiIds = currentAiIds.filter((id: string) => !toRejectIds.includes(id))
              const updatedRejected = Array.from(new Set([...currentRejected, ...toRejectIds]))

              for (const rid of toRejectIds) {
                delete meta[rid]
              }

              await (supabase as any)
                .from('products')
                .update({
                  ai_related_ids: updatedAiIds,
                  rejected_related_ids: updatedRejected,
                  ai_related_meta: meta,
                })
                .eq('id', prodId)
            }
            processedCount += prodItems.length
            setBatchProgress({ current: processedCount, total })
          }),
        )

        await new Promise((r) => setTimeout(r, 200))
      }

      toast({
        title: 'Sugestões rejeitadas',
        description: `${total} relacionamento(s) rejeitado(s) e adicionados aos rejeitados permanentes.`,
      })
      await loadPendingReviews()
    } catch (err: any) {
      toast({
        title: 'Erro no processamento',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsBatchProcessing(false)
      setBatchProgress(null)
    }
  }

  // Busca rápida para adicionar relacionado manual
  const handleSearchCatalog = async (query: string) => {
    setCatalogSearch(query)
    if (!query || query.trim().length < 2) {
      setCatalogResults([])
      return
    }

    try {
      setSearchingCatalog(true)
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, category')
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
        .eq('is_discontinued', false)
        .limit(10)

      setCatalogResults(data || [])
    } catch (err: any) {
      console.warn('Erro na busca de produtos:', err.message)
    } finally {
      setSearchingCatalog(false)
    }
  }

  const handleAddManualRelated = async (relatedProduct: ProductSearchResult) => {
    if (!targetProduct) return

    try {
      const { data: p } = await supabase
        .from('products')
        .select('id, manual_related_ids')
        .eq('id', targetProduct.id)
        .single()

      if (p) {
        const currentManual = Array.isArray(p.manual_related_ids) ? p.manual_related_ids : []
        if (!currentManual.includes(relatedProduct.id)) {
          const updated = [...currentManual, relatedProduct.id]
          await supabase
            .from('products')
            .update({ manual_related_ids: updated })
            .eq('id', targetProduct.id)

          toast({
            title: 'Relacionado adicionado!',
            description: `${relatedProduct.name} vinculado manualmente a ${targetProduct.name}.`,
          })
        } else {
          toast({ title: 'Já vinculado', description: 'Este produto já é um relacionado manual.' })
        }
      }
      setIsAddModalOpen(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao adicionar',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <AdminLayout breadcrumb="Revisão de Sugestões de Relacionados">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Fila de Revisão de Relacionados (Baixa Confiança)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Avalie sugestões preliminares geradas pela IA que requerem confirmação antes de
              ficarem visíveis publicamente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadPendingReviews}
              disabled={loading || isBatchProcessing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Barra de Ações em Lote */}
        <Card className="border-border/50 bg-card/60">
          <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por produto, SKU, sugerido ou justificativa..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-9 bg-background/50 text-xs h-9"
                />
              </div>
              <Badge variant="outline" className="font-mono text-xs shrink-0">
                {filteredItems.length} pendente(s)
              </Badge>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-xs text-muted-foreground mr-2">
                {selectedKeys.size} de até 100 selecionado(s)
              </span>
              <Button
                size="sm"
                variant="outline"
                className="bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50"
                disabled={selectedKeys.size === 0 || isBatchProcessing}
                onClick={() => processApproval(Array.from(selectedKeys))}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-400" />
                Aprovar em Bloco ({selectedKeys.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-red-950/40 border-red-500/30 text-red-300 hover:bg-red-900/50"
                disabled={selectedKeys.size === 0 || isBatchProcessing}
                onClick={() => processRejection(Array.from(selectedKeys))}
              >
                <XCircle className="w-4 h-4 mr-1.5 text-red-400" />
                Rejeitar em Bloco ({selectedKeys.size})
              </Button>
            </div>
          </CardContent>

          {isBatchProcessing && batchProgress && (
            <div className="px-4 pb-4 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Processando em chunks de 10 em 10...</span>
                <span>
                  {batchProgress.current} / {batchProgress.total} (
                  {Math.round((batchProgress.current / batchProgress.total) * 100)}%)
                </span>
              </div>
              <Progress
                value={(batchProgress.current / batchProgress.total) * 100}
                className="h-2"
              />
            </div>
          )}
        </Card>

        {/* Tabela de Revisão */}
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      checked={
                        filteredItems.length > 0 &&
                        filteredItems.slice(0, 100).every((it) => selectedKeys.has(getItemKey(it)))
                      }
                      onCheckedChange={(c) => toggleSelectAll(Boolean(c))}
                    />
                  </TableHead>
                  <TableHead>Produto Principal</TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Item Sugerido</TableHead>
                  <TableHead>Justificativa IA</TableHead>
                  <TableHead className="w-28 text-center">Confiança</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                      Carregando fila de revisão...
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      Nenhuma sugestão de baixa confiança pendente de revisão. Todas foram aprovadas
                      ou filtradas!
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const key = getItemKey(item)
                    const isSelected = selectedKeys.has(key)

                    return (
                      <TableRow key={key} className={isSelected ? 'bg-primary/5' : ''}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectItem(key)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-sm leading-tight">
                            {item.productName}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                            {item.productSku && <span>SKU: {item.productSku}</span>}
                            {item.productCategory && (
                              <Badge variant="secondary" className="text-[10px] py-0">
                                {item.productCategory}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-center">
                          <ArrowRight className="w-4 h-4 inline" />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm leading-tight">
                            {item.suggestedName}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                            {item.suggestedSku && <span>SKU: {item.suggestedSku}</span>}
                            {item.suggestedCategory && (
                              <Badge variant="secondary" className="text-[10px] py-0">
                                {item.suggestedCategory}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs">
                          <p className="line-clamp-2" title={item.reason}>
                            {item.reason}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-red-950 text-red-300 border-red-500/30 text-[10px]">
                            ? baixa
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => processApproval([key])}
                            title="Aprovar relacionamento"
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => processRejection([key])}
                            title="Rejeitar (não sugerir mais)"
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/40"
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setTargetProduct({ id: item.productId, name: item.productName })
                              setCatalogSearch('')
                              setCatalogResults([])
                              setIsAddModalOpen(true)
                            }}
                            title="Vincular outro produto manualmente"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Modal Autocomplete Adicionar Manual */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Adicionar Relacionado Manual
            </DialogTitle>
            <DialogDescription>
              Vincular acessório manual ao produto: <strong>{targetProduct?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Input
                placeholder="Buscar produto por nome ou SKU..."
                value={catalogSearch}
                onChange={(e) => handleSearchCatalog(e.target.value)}
                autoFocus
              />
            </div>

            <ScrollArea className="h-60 border border-border/50 rounded-lg p-2 bg-muted/20">
              {searchingCatalog ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                  Buscando catálogo...
                </div>
              ) : catalogResults.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  {catalogSearch.length < 2
                    ? 'Digite ao menos 2 caracteres para buscar.'
                    : 'Nenhum produto encontrado.'}
                </div>
              ) : (
                <div className="space-y-1">
                  {catalogResults.map((prod) => (
                    <div
                      key={prod.id}
                      onClick={() => handleAddManualRelated(prod)}
                      className="p-2 rounded hover:bg-muted/50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="truncate max-w-[280px]">
                        <p className="font-medium truncate text-foreground">{prod.name}</p>
                        <p className="text-muted-foreground text-[10px] font-mono">
                          {prod.sku || 'Sem SKU'} • {prod.category || 'Geral'}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        Vincular
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
