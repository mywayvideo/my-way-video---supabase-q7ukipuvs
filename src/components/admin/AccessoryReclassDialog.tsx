import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  accessoryService,
  ACCESSORY_CATEGORY_NAME,
  AccessoryProduct,
  ParentCategory,
} from '@/services/accessoryService'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Loader2,
  PowerOff,
  RefreshCw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'

interface ReclassRow {
  product: AccessoryProduct
  /** null = ainda não sugerido; undefined = IA não sugeriu destino */
  suggestedCategoryId: string | null | undefined
  justification: string | null
  /** Categoria escolhida pelo revisor (inicia na sugestão da IA). */
  selectedCategoryId: string
}

interface AccessoryReclassDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Recarrega métricas da página após aprovar/desativar. */
  onChanged?: () => void
}

export function AccessoryReclassDialog({
  open,
  onOpenChange,
  onChanged,
}: AccessoryReclassDialogProps) {
  const [loading, setLoading] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [accessoriesCategoryId, setAccessoriesCategoryId] = useState<string | null>(null)
  const [parentCategories, setParentCategories] = useState<ParentCategory[]>([])
  const [rows, setRows] = useState<ReclassRow[]>([])
  const [processedCount, setProcessedCount] = useState(0) // aprovados desde a abertura
  const [remainingCount, setRemainingCount] = useState<number | null>(null)

  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const categoriesById = useMemo(() => {
    const map = new Map<string, ParentCategory>()
    parentCategories.forEach((c) => map.set(c.id, c))
    return map
  }, [parentCategories])

  /** Itens com destino decidido (IA sugeriu OU revisor escolheu manualmente). */
  const decidedRows = useMemo(() => rows.filter((r) => r.suggestedCategoryId !== undefined), [rows])
  /** Fila separada: IA não sugeriu nada — só saem daqui com escolha manual. */
  const undecidedRows = useMemo(
    () => rows.filter((r) => r.suggestedCategoryId === undefined),
    [rows],
  )

  const fetchCounts = useCallback(async () => {
    try {
      const batch = await accessoryService.fetchAccessoryBatch()
      setAccessoriesCategoryId(batch.categoryId)
      setRemainingCount(null)
      if (batch.categoryId) {
        const { supabase } = await import('@/lib/supabase/client')
        const { count } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('category_id', batch.categoryId)
        setRemainingCount(count ?? 0)
      }
    } catch {
      /* contagem é cosmética; falha não bloqueia */
    }
  }, [])

  /** Carrega um lote de até 100 acessórios e pede sugestões em chunks de 20. */
  const loadBatch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [batch, parents] = await Promise.all([
        accessoryService.fetchAccessoryBatch(),
        accessoryService.fetchParentCategories(),
      ])
      setParentCategories(parents)
      setAccessoriesCategoryId(batch.categoryId)

      // estado inicial: todos "sem decisão" até a IA responder
      const initialRows: ReclassRow[] = batch.products.map((p) => ({
        product: p,
        suggestedCategoryId: undefined,
        justification: null,
        selectedCategoryId: '',
      }))

      if (initialRows.length > 0) {
        setRows(initialRows)
        setSuggesting(true)
        const suggestions: Map<string, { categoryId: string | null; justification: string }> =
          new Map()
        for (let i = 0; i < batch.products.length; i += 20) {
          const chunk = batch.products.slice(i, i + 20)
          try {
            const sug = await accessoryService.suggestAccessoryCategories(chunk, parents)
            for (const s of sug) {
              suggestions.set(s.productId, {
                categoryId: s.categoryId,
                justification: s.justification || '',
              })
            }
          } catch (chunkErr) {
            console.error('Falha no chunk de sugestões:', chunkErr)
            // chunk falhou: itens dele permanecem na fila "sem decisão"
          }
          setRows((prev) =>
            prev.map((r) => {
              const s = suggestions.get(r.product.id)
              if (!s) return r
              return {
                ...r,
                suggestedCategoryId: s.categoryId,
                justification: s.justification,
                selectedCategoryId: s.categoryId || '',
              }
            }),
          )
        }
        setSuggesting(false)
      } else {
        setRows([])
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao carregar acessórios.')
    } finally {
      setLoading(false)
      setSuggesting(false)
    }
  }, [])

  // Abre carregando o lote automaticamente
  useEffect(() => {
    if (open) {
      void loadBatch()
    } else {
      setRows([])
      setError(null)
      setProcessedCount(0)
    }
  }, [open, loadBatch])

  const handleSelectionChange = (productId: string, categoryId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.product.id === productId ? { ...r, selectedCategoryId: categoryId } : r)),
    )
  }

  /** "Deixar para depois": sai desta rodada, mas continua em Accessories. */
  const discardRow = (productId: string) => {
    setRows((prev) => prev.filter((r) => r.product.id !== productId))
  }

  /** Aprova (em blocos de ≤100) as linhas com destino escolhido e persiste uma a uma. */
  const handleApprove = async () => {
    const approved = decidedRows.filter((r) => r.selectedCategoryId)
    if (approved.length === 0) return
    setApproving(true)
    setError(null)
    try {
      let ok = 0
      for (let i = 0; i < approved.length; i += 100) {
        const block = approved.slice(i, i + 100)
        for (const row of block) {
          const cat = categoriesById.get(row.selectedCategoryId)
          await accessoryService.approveAccessoryReclass(
            row.product.id,
            row.selectedCategoryId,
            cat?.name || '',
          )
          ok += 1
        }
      }
      setRows((prev) => prev.filter((r) => !approved.some((a) => a.product.id === r.product.id)))
      setProcessedCount((c) => c + ok)
      setRemainingCount((c) => (c === null ? null : Math.max(0, c - ok)))
      onChanged?.()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao aprovar reclassificação.')
    } finally {
      setApproving(false)
    }
  }

  const handleDeactivate = async () => {
    setDeactivating(true)
    setError(null)
    try {
      await accessoryService.deactivateAccessoriesCategory()
      setConfirmDeactivate(false)
      onChanged?.()
      await fetchCounts()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao desativar a categoria.')
    } finally {
      setDeactivating(false)
    }
  }

  const categoryIsEmpty = remainingCount !== null && remainingCount <= 0
  const decidedWithTarget = decidedRows.filter((r) => r.selectedCategoryId).length

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Reclassificação assistida de acessórios
            </DialogTitle>
            <DialogDescription>
              A IA sugere a categoria-mãe de cada acessório de{' '}
              <strong>{ACCESSORY_CATEGORY_NAME}</strong>; a decisão é sempre sua. Produtos sem
              sugestão ficam na fila &quot;sem decisão&quot; para você escolher o destino.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Barra de status */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Restantes em {ACCESSORY_CATEGORY_NAME}:{' '}
              <strong className="font-mono">{remainingCount ?? '…'}</strong>
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Bot className="w-3 h-3" />
              Com sugestão: <strong className="font-mono">{decidedWithTarget}</strong>
            </Badge>
            <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400">
              <HelpCircle className="w-3 h-3" />
              Sem decisão: <strong className="font-mono">{undecidedRows.length}</strong>
            </Badge>
            <Badge variant="outline" className="gap-1">
              <ChevronRight className="w-3 h-3" />
              Aprovados nesta sessão: <strong className="font-mono">{processedCount}</strong>
            </Badge>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => void loadBatch()}
                disabled={loading || suggesting}
              >
                <RefreshCw className={cn('w-3 h-3', (loading || suggesting) && 'animate-spin')} />
                Recarregar lote
              </Button>
            </div>
          </div>

          {(loading || suggesting) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {loading
                ? 'Carregando lote de acessórios…'
                : 'Consultando a IA (chunks de 20)… as sugestões aparecem conforme chegam.'}
            </div>
          )}
          {suggesting && rows.length > 0 && (
            <Progress value={Math.round((decidedRows.length / rows.length) * 100)} />
          )}

          <Separator />

          {/* Lista */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
            {rows.length === 0 && !loading && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {remainingCount === 0 ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    Nenhum acessório restante em {ACCESSORY_CATEGORY_NAME}. Você pode desativá-la
                    abaixo.
                  </>
                ) : (
                  <>Nenhum acessório carregado. Clique em &quot;Recarregar lote&quot;.</>
                )}
              </div>
            )}

            {rows.map((row) => {
              const hasSuggestion = row.suggestedCategoryId !== undefined
              return (
                <div
                  key={row.product.id}
                  className={cn(
                    'rounded-lg border p-3 space-y-1.5',
                    !hasSuggestion && 'border-amber-300 dark:border-amber-800 bg-amber-500/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" title={row.product.name}>
                        {row.product.name}
                      </p>
                      {row.product.sku && (
                        <p className="text-[11px] text-muted-foreground font-mono">
                          SKU: {row.product.sku}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => discardRow(row.product.id)}
                      title="Deixar para depois (remove só desta rodada, sem alterar o banco)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="flex-1 text-[11px] text-muted-foreground italic">
                      {hasSuggestion ? (
                        row.justification ? (
                          <span className="line-clamp-2" title={row.justification}>
                            {row.justification}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70">Sem justificativa da IA.</span>
                        )
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">
                          A IA não sugeriu categoria — escolha o destino manualmente.
                        </span>
                      )}
                    </div>
                    <Select
                      value={row.selectedCategoryId}
                      onValueChange={(v) => handleSelectionChange(row.product.id, v)}
                    >
                      <SelectTrigger
                        className={cn(
                          'h-8 text-xs w-[240px] shrink-0 bg-background',
                          !hasSuggestion && 'border-amber-300 dark:border-amber-800',
                        )}
                      >
                        <SelectValue placeholder="Escolher destino…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {parentCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter className="flex-col sm:flex-col gap-2 pt-2 border-t">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
              <div className="text-xs text-muted-foreground">
                {decidedWithTarget > 0 ? (
                  <>
                    {decidedWithTarget} produto(s) prontos para aprovar em bloco
                    {decidedWithTarget > 100 ? ' (serão enviados em blocos de 100)' : ''}.
                  </>
                ) : (
                  'Escolha o destino dos itens para habilitar a aprovação.'
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={!categoryIsEmpty || deactivating || approving}
                  onClick={() => setConfirmDeactivate(true)}
                  title={
                    categoryIsEmpty
                      ? 'Desativa a categoria (não apaga).'
                      : `Só é possível desativar quando ${ACCESSORY_CATEGORY_NAME} estiver zerada.`
                  }
                >
                  {deactivating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <PowerOff className="w-3.5 h-3.5" />
                  )}
                  Desativar {ACCESSORY_CATEGORY_NAME}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={decidedWithTarget === 0 || approving || suggesting}
                  onClick={() => void handleApprove()}
                >
                  {approving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  Aprovar {decidedWithTarget > 0 ? `(${decidedWithTarget})` : ''}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de desativação */}
      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {ACCESSORY_CATEGORY_NAME}?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria deixará de ser listada no catálogo e não receberá novos produtos. Ela não
              é apagada — pode ser reativada depois. Só é possível desativá-la quando estiver
              zerada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void handleDeactivate()
              }}
            >
              {deactivating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Desativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
