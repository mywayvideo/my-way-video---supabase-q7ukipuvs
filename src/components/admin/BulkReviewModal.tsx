import { useState, useEffect } from 'react'
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
import { toast } from '@/hooks/use-toast'
import { Plus, Loader2, Save } from 'lucide-react'
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

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
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

    for (let i = 0; i < editedProducts.length; i++) {
      const p = editedProducts[i]
      toast({
        title: 'Progresso',
        description: `Salvando produto ${i + 1} de ${editedProducts.length}`,
      })

      try {
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
          category_id: p.category_id || null,
          manufacturer_id: p.manufacturer_id || null,
          description: p.description || '',
          technical_info: p.technical_info || '',
          image_url: p.image_url || '',
          is_discontinued: p.is_discontinued === 'true' || p.is_discontinued === true,
          is_special: p.is_special === 'true' || p.is_special === true,
        }
        await productService.createProduct(payload)
      } catch (err: any) {
        newErrors[i] = err.message || 'Erro ao salvar'
        hasError = true
      }
    }

    setIsSaving(false)
    setErrors(newErrors)

    if (!hasError) {
      toast({ title: 'Sucesso', description: 'Todos os produtos foram salvos com sucesso.' })
      onSuccess()
      onClose()
    } else {
      toast({
        title: 'Aviso',
        description: 'Alguns produtos falharam ao salvar.',
        variant: 'destructive',
      })
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
          {isLoading ? (
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
            Cancelar
          </Button>
          <Button onClick={handleSaveAll} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isSaving ? 'Salvando...' : 'Salvar Todos'}
          </Button>
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
