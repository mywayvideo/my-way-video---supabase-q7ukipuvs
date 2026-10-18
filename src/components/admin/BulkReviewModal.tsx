import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { productService } from '@/services/productService'
import {
  categoryImportStagingService,
  StagingProductItem,
} from '@/services/categoryImportStagingService'
import { CategoryItem } from '@/services/categoryTriageService'
import { toast } from '@/hooks/use-toast'
import { Plus, Loader2, Save, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ManufacturerDialog } from '@/components/admin/ManufacturerDialog'

interface BulkReviewModalProps {
  isOpen: boolean
  onClose: () => void
  products: any[]
  categories: any[]
  manufacturers: any[]
  onSuccess: () => void
  onAddManufacturer: (name: string) => Promise<any>
}

export function BulkReviewModal({
  isOpen,
  onClose,
  products,
  categories,
  manufacturers,
  onSuccess,
  onAddManufacturer,
}: BulkReviewModalProps) {
  const [editedProducts, setEditedProducts] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [isLoading, setIsLoading] = useState(true)

  const [showMfgDialog, setShowMfgDialog] = useState(false)
  const [activeMfgRow, setActiveMfgRow] = useState<number | null>(null)
  const [batchReport, setBatchReport] = useState<{
    batchId: string
    directMatchedCount: number
    stagingCount: number
    discardedCount: number
    totalCount: number
  } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
      setBatchReport(null)
      const initial = products.map((p) => ({
        ...p,
        price_cost: p.price_cost || 0,
        price_usa: p.price_usa || 0,
        price_nationalized_cost: p.price_nationalized_cost || 0,
        price_nationalized_sales: p.price_nationalized_sales || 0,
      }))
      setEditedProducts(initial)
      setErrors({})
      setIsLoading(false)
    }
  }, [isOpen, products])

  const handleUpdate = (index: number, field: string, value: any) => {
    const updated = [...editedProducts]
    updated[index] = { ...updated[index], [field]: value }
    setEditedProducts(updated)
  }

  const handleAddManufacturerClick = (index: number) => {
    setActiveMfgRow(index)
    setShowMfgDialog(true)
  }

  const handleSaveManufacturer = async (nameStr: string) => {
    if (!nameStr.trim()) return
    const existing = manufacturers.find(
      (m) => m.name.toLowerCase() === nameStr.trim().toLowerCase(),
    )

    if (existing && activeMfgRow !== null) {
      handleUpdate(activeMfgRow, 'manufacturer_id', existing.id)
      toast({ title: 'Aviso', description: 'Fabricante já existe. Selecionado automaticamente.' })
      return
    }

    try {
      const res = await onAddManufacturer(nameStr.trim())
      if (res && res.id && activeMfgRow !== null) {
        handleUpdate(activeMfgRow, 'manufacturer_id', res.id)
      }
    } catch (e) {
      toast({
        title: 'Erro',
        description: 'Falha ao adicionar fabricante.',
        variant: 'destructive',
      })
    }
  }

  const handleSaveAll = async () => {
    setIsSaving(true)
    setErrors({})
    let hasError = false
    const newErrors: Record<number, string> = {}

    const batchId = `bh_${Date.now()}`
    let directMatchedCount = 0
    let stagingCount = 0
    const discardedCount = 0 // Sempre 0 numa importação nova

    try {
      // 1. Carregar mapeamentos memorizados persistentes
      const mappings = await categoryImportStagingService.getCategoryMappings()
      const categoriesList: CategoryItem[] = categories.map((c) => ({
        id: c.id,
        name: c.name,
      }))

      const stagingItemsToInsert: Array<Partial<StagingProductItem>> = []

      for (let i = 0; i < editedProducts.length; i++) {
        const p = editedProducts[i]
        toast({
          title: 'Processando lote B&H',
          description: `Avaliando item ${i + 1} de ${editedProducts.length} (${p.sku || p.name})`,
        })

        // Identificar categoria original informada (ex: vinda da extração B&H ou input)
        const rawCategory = (p.extracted_category || p.category || p.original_category || '').trim()
        const selectedCat = categories.find((c) => c.id === p.category_id)
        const effectiveCategoryName = selectedCat?.name || rawCategory

        // Chamar resolveCategoryMatch
        const matchResult = categoryImportStagingService.resolveCategoryMatch({
          rawCategory: effectiveCategoryName,
          productName: p.name,
          productDescription: p.description,
          productNcm: p.ncm,
          categories: categoriesList,
          mappings,
        })

        const selectedMfg = manufacturers.find((m) => m.id === p.manufacturer_id)
        const brandName = selectedMfg?.name || p.extracted_brand || p.manufacturer || ''

        // Se o usuário selecionou uma categoria válida no dropdown OU casou direto
        if (p.category_id || (matchResult.isMatchedDirect && matchResult.matchedCategoryId)) {
          const finalCatId = p.category_id || matchResult.matchedCategoryId
          const finalCatName = selectedCat?.name || matchResult.matchedCategoryName

          const payload = {
            name: p.name,
            sku: p.sku,
            price_usd: parseFloat(p.price_usa) || 0,
            price_usa: parseFloat(p.price_usa) || 0,
            price_cost: parseFloat(p.price_cost) || 0,
            price_nationalized_cost: parseFloat(p.price_nationalized_cost) || null,
            price_nationalized_sales: parseFloat(p.price_nationalized_sales) || null,
            price_brl: parseFloat(p.price_nationalized_cost) || parseFloat(p.price_cost) || 0,
            dimensions: p.dimensions || '',
            weight: parseFloat(p.weight) || 0,
            category_id: finalCatId,
            category: finalCatName,
            manufacturer_id: p.manufacturer_id || null,
            brand: brandName || null,
            description: p.description || '',
            technical_info: p.technical_info || '',
            image_url: p.image_url || '',
            website_url: p._url || p.website_url || p.source_url || null,
            is_discontinued: p.is_discontinued === 'true' || p.is_discontinued === true,
            is_special: p.is_special === 'true' || p.is_special === true,
          }

          try {
            await productService.createProduct(payload)
            directMatchedCount++
          } catch (err: any) {
            newErrors[i] = err.message || 'Erro ao salvar'
            hasError = true
          }
        } else {
          // NÃO casado direto: envia para product_import_staging
          const stagingItem: Partial<StagingProductItem> = {
            batch_id: batchId,
            batch_source: 'bh',
            sku: p.sku || null,
            name: p.name,
            manufacturer_id: p.manufacturer_id || null,
            brand_name: brandName || null,
            price_usd: parseFloat(p.price_usa) || 0,
            price_cost: parseFloat(p.price_cost) || 0,
            price_brl: parseFloat(p.price_nationalized_cost) || parseFloat(p.price_cost) || 0,
            weight: parseFloat(p.weight) || 0,
            dimensions: p.dimensions || null,
            stock: 0,
            ncm: p.ncm || null,
            image_url: p.image_url || null,
            description: p.description || null,
            technical_info: p.technical_info || null,
            website_url: p._url || p.website_url || p.source_url || null,
            is_special: p.is_special === 'true' || p.is_special === true,
            is_discontinued: p.is_discontinued === 'true' || p.is_discontinued === true,
            price_nationalized_sales: parseFloat(p.price_nationalized_sales) || null,
            price_nationalized_cost: parseFloat(p.price_nationalized_cost) || null,
            price_nationalized_currency: 'USD',

            original_category: rawCategory || null,
            suggested_category_id: matchResult.suggestedCategoryId,
            suggested_category_name: matchResult.suggestedCategoryName,
            suggestion_confidence: matchResult.confidence,
            suggestion_reason: matchResult.reason,

            status: 'pending',
            raw_payload: p,
          }

          stagingItemsToInsert.push(stagingItem)
          stagingCount++
        }
      }

      if (stagingItemsToInsert.length > 0) {
        const stagingRes =
          await categoryImportStagingService.insertStagingBatch(stagingItemsToInsert)
        if (!stagingRes.success) {
          console.error('Falha ao inserir itens B&H em staging:', stagingRes.error)
          toast({
            title: 'Aviso sobre Staging',
            description: `Houve erro ao salvar itens em staging: ${stagingRes.error}`,
            variant: 'destructive',
          })
        }
      }

      setBatchReport({
        batchId,
        directMatchedCount,
        stagingCount,
        discardedCount,
        totalCount: editedProducts.length,
      })

      if (!hasError) {
        toast({
          title: 'Lote B&H Processado com Sucesso',
          description: `Casados direto: ${directMatchedCount} · Aguardando confirmação (staging): ${stagingCount}`,
        })
        onSuccess()
      } else {
        toast({
          title: 'Aviso',
          description: 'Alguns produtos casados falharam ao salvar.',
          variant: 'destructive',
        })
      }
    } catch (e: any) {
      toast({
        title: 'Erro no processamento',
        description: e?.message || 'Falha ao processar lote',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
      setErrors(newErrors)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSaving && !open && onClose()}>
      <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col overflow-hidden bg-card border-border/50">
        <DialogHeader>
          <DialogTitle>Revisão de Importação em Lote</DialogTitle>
          <DialogDescription>
            Revise e edite os detalhes extraídos antes de confirmar e salvar no catálogo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4">
          {batchReport ? (
            <div className="p-6 border rounded-xl bg-muted/20 space-y-4 max-w-xl mx-auto my-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-foreground">
                    Relatório de Fechamento do Lote B&H
                  </h3>
                  <p className="text-xs font-mono text-muted-foreground">{batchReport.batchId}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm bg-background/50 p-4 rounded-lg border border-white/5">
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-emerald-400 font-medium">
                    Casados direto (entraram em products):
                  </span>
                  <strong className="text-emerald-400 font-mono text-base">
                    {batchReport.directMatchedCount}
                  </strong>
                </div>
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-amber-400 font-medium">
                    Aguardando confirmação (staging):
                  </span>
                  <strong className="text-amber-400 font-mono text-base">
                    {batchReport.stagingCount}
                  </strong>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-zinc-400 font-medium">Descartados:</span>
                  <strong className="text-zinc-400 font-mono text-base">
                    {batchReport.discardedCount}
                  </strong>
                </div>
              </div>

              {batchReport.stagingCount > 0 && (
                <div className="pt-2">
                  <Button
                    asChild
                    className="w-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30"
                  >
                    <Link to="/admin/import-review" onClick={onClose}>
                      Ir para Revisão de Importação ({batchReport.stagingCount} pendentes)
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Nome</TableHead>
                  <TableHead className="w-24">USD (Miami)</TableHead>
                  <TableHead className="w-24">Custo (USD)</TableHead>
                  <TableHead className="w-24">Custo Nac. (USD)</TableHead>
                  <TableHead className="w-24">Venda Nac. (USD)</TableHead>
                  <TableHead className="w-32">Dimensões</TableHead>
                  <TableHead className="w-24">Peso (lbs)</TableHead>
                  <TableHead className="w-40">Categoria</TableHead>
                  <TableHead className="w-48">Fabricante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editedProducts.map((p, idx) => (
                  <TableRow
                    key={idx}
                    className={cn(
                      'transition-colors',
                      errors[idx] && 'border-l-4 border-l-red-500 bg-red-500/5',
                    )}
                  >
                    <TableCell>
                      <Input
                        value={p.name}
                        onChange={(e) => handleUpdate(idx, 'name', e.target.value)}
                        title={errors[idx] || p.name}
                        className={cn(errors[idx] && 'border-red-500')}
                      />
                      {errors[idx] && (
                        <p className="text-[10px] text-red-500 mt-1">{errors[idx]}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={p.price_usa}
                        onChange={(e) => handleUpdate(idx, 'price_usa', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={p.price_cost}
                        onChange={(e) => handleUpdate(idx, 'price_cost', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={p.price_nationalized_cost}
                        onChange={(e) =>
                          handleUpdate(idx, 'price_nationalized_cost', e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={p.price_nationalized_sales}
                        onChange={(e) =>
                          handleUpdate(idx, 'price_nationalized_sales', e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={p.dimensions || ''}
                        onChange={(e) => handleUpdate(idx, 'dimensions', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={p.weight || ''}
                        onChange={(e) => handleUpdate(idx, 'weight', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={p.category_id || ''}
                        onValueChange={(val) => handleUpdate(idx, 'category_id', val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={p.manufacturer_id || ''}
                          onValueChange={(val) => handleUpdate(idx, 'manufacturer_id', val)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Fabricante" />
                          </SelectTrigger>
                          <SelectContent>
                            {manufacturers.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleAddManufacturerClick(idx)}
                          className="shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="mt-4 border-t border-border/50 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {batchReport ? 'Fechar' : 'Cancelar'}
          </Button>
          {!batchReport && (
            <Button onClick={handleSaveAll} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {isSaving ? 'Salvando...' : 'Salvar Todos'}
            </Button>
          )}
        </DialogFooter>

        <ManufacturerDialog
          isOpen={showMfgDialog}
          onClose={() => setShowMfgDialog(false)}
          onSave={handleSaveManufacturer}
        />
      </DialogContent>
    </Dialog>
  )
}
